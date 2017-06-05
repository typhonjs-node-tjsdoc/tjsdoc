import mainEventbus  from 'backbone-esnext-eventbus';
import path          from 'path';
import PluginManager from 'typhonjs-plugin-manager';

// Only load one instance of `babel-polyfill`.
if (!global._babelPolyfill) { require('babel-polyfill'); }

// Set `TJSDOC_ENV` environment variable to standard (published modules) unless `BABEL_ENV` is `tjsdoc-dev`.
process.env.TJSDOC_ENV = process.env.BABEL_ENV === 'tjsdoc-dev' ? 'development' : 'standard';

/**
 * API Documentation Generator.
 *
 * @example
 * TJSDoc.generate(
 * {
 *    source: './src',
 *    destination: './docs',
 *    publisher: 'tjsdoc-publisher-static-html',
 *    runtime: 'tjsdoc-babylon'
 * });
 */
export default class TJSDoc
{
   /**
    * Path to `package.json` for TJSDoc.
    * @type {string}
    */
   static tjsdocPackagePath = path.resolve(__dirname, '../package.json');

   /**
    * Handles initial setup of the runtime environment and then invokes `s_GENERATE` to commence with doc generation.
    *
    * @param {TJSDocConfig} config - config for pre-generation validation and loading.
    */
   static generate(config)
   {
      /**
       * Stores the target project package object.
       * @type {NPMPackageObject}
       */
      let packageObj = {};

      /**
       * Stores the formatted package info.
       * @type {{}}
       */
      let packageInfo = {};

      /**
       * The runtime plugin manager for internal and user plugins.
       * @type {PluginManager}
       */
      const pluginManager = new PluginManager({ eventbus: mainEventbus });

      /**
       * A local event proxy for easy removal of event bindings to `mainEventbus`.
       * @type {EventProxy}
       */
      const runtimeEventProxy = pluginManager.createEventProxy();

      // Add an event binding to return the runtime event proxy.
      runtimeEventProxy.on('tjsdoc:system:event:proxy:runtime:get', () => runtimeEventProxy);

      // Load the logger plugin and enable auto plugin filters which adds inclusive filters for all plugins added.
      // In addition add inclusive log trace filter to limit info and trace to just tjsdoc source.
      pluginManager.add(
      {
         name: 'typhonjs-color-logger',
         options: {
            autoPluginFilters: true,
            filterConfigs: [
               {
                  type: 'inclusive',
                  name: 'tjsdoc',
                  filterString: '(tjsdoc\/dist|tjsdoc\/src)'
               }
            ]
         }
      });

      try
      {
         if (typeof config !== 'object') { throw new TypeError(`'config' is not an 'object'`); }

         // Set `global.$$tjsdoc_version` and add an event binding to get the TJSDoc version.
         s_SET_VERSION(this.tjsdocPackagePath, runtimeEventProxy);

         // Ensure that `config.runtime` is defined.
         if (config.runtime !== null && typeof config.runtime !== 'string' && typeof config.runtime !== 'object')
         {
            const error = new TypeError(`'config.runtime' is not an 'object' or 'string'.`);
            error._objectValidateError = true;
            throw error;
         }

         // Allow any plugins which may alter `config.publisher` a chance to do so before loading. Add
         // `config.publisherOptions` to the config to set particular options passed to the publisher.
         pluginManager.add(typeof config.publisher === 'object' ?
          Object.assign({ options: config.publisherOptions }, config.publisher) :
           { name: config.publisher, options: config.publisherOptions });

         // Allow any plugins which may alter `config.runtime` a chance to do so before loading. Add
         // `config.runtimeOptions` to plugin config.
         pluginManager.add(typeof config.runtime === 'object' ?
          Object.assign({ options: config.runtimeOptions }, config.runtime) :
           { name: config.runtime, options: config.runtimeOptions });

         mainEventbus.trigger('log:info:raw', `tjsdoc - environment: ${process.env.TJSDOC_ENV}`);

         mainEventbus.trigger('log:info:raw', `tjsdoc - runtime: ${
          typeof config.runtime === 'object' ? config.runtime.name : config.runtime}`);

         // Resolve the config file including any extensions and set any default config values.
         config = mainEventbus.triggerSync('tjsdoc:system:config:resolver:resolve', config);

         const pubConfig = config.publisherOptions || {};

         // Add all user specified plugins.
         pluginManager.addAll(config.plugins);

         // Allow external plugins to modify the config file.
         pluginManager.invokeSyncEvent('onHandleConfig', void 0, { config, pubConfig });

         // Validate the config file checking for any improper or missing values after potential user modification.
         mainEventbus.triggerSync('tjsdoc:system:config:resolver:validate:post', config);

         // Set log level.
         mainEventbus.trigger('log:level:set', config.logLevel);

         // Set `typhonjs-file-util` compress format / relative path and lock it from being changed.
         mainEventbus.trigger('typhonjs:util:file:options:set',
         {
            compressFormat: config.compressFormat,
            logEvent: 'log:info:raw',
            relativePath: config.destination,
            lockRelative: true
         });

         // Create RegExp instances for any includes / excludes definitions.
         config._includes = config.includes.map((v) => new RegExp(v));
         config._excludes = config.excludes.map((v) => new RegExp(v));

         // Make sure that either `config.source` or `config.sourceFiles` is defined.
         if (!Array.isArray(config.sourceFiles) && typeof config.source === 'undefined')
         {
            const error = new TypeError(`'config.source' or 'config.sourceFiles' is not defined.`);
            error._objectValidateError = true;
            throw error;
         }

         // The current working path of where TJSDoc has been executed from; the target project.
         config._dirPath = process.cwd();

         // Add all virtual / remote typedef & external references from dependent NPM modules. This should only
         // be enabled when building documentation for TJSDoc itself.
         if (typeof config.builtinPluginVirtual === 'boolean' && config.builtinPluginVirtual)
         {
            pluginManager.addAll(
            [
               { name: 'backbone-esnext-events/.tjsdoc/virtual/remote' },
               { name: 'typhonjs-plugin-manager/.tjsdoc/virtual/remote' }
            ]);

            runtimeEventProxy.on('typhonjs:plugin:manager:plugin:added', (pluginData) =>
            {
               s_BUILTIN_PLUGIN_VIRTUAL(pluginData, pluginManager);
            });
         }

         // Load target repo `package.json`
         if (config.package)
         {
            try
            {
               packageObj = require(path.resolve(config.package));
               packageInfo = mainEventbus.triggerSync('typhonjs:util:package:object:format', packageObj);
            }
            catch (err) { /* nop */ }
         }

         // Deep freeze the target project package objects.
         mainEventbus.trigger('typhonjs:object:util:deep:freeze', packageObj);
         mainEventbus.trigger('typhonjs:object:util:deep:freeze', packageInfo);

         // Create event bindings for retrieving `package.json` related resources.
         runtimeEventProxy.on('tjsdoc:data:package:object:get', () => { return packageObj; });
         runtimeEventProxy.on('tjsdoc:data:package:info:get', () => { return packageInfo; });

         // If `config.sourceFiles` is not defined then hydrate `config.source` as source globs.
         if (!Array.isArray(config.sourceFiles))
         {
            const result = mainEventbus.triggerSync('typhonjs:util:file:glob:hydrate', config.source);

            config.sourceFiles = result.files;
            config._sourceGlobs = result.globs;
            Object.freeze(config._sourceGlobs);
         }
         else
         {
            // If `config.sourceFiles` is defined then make a copy of `sourceFiles` assigning it as `_sourceGlobs`.
            config._sourceGlobs = JSON.parse(JSON.stringify(config.sourceFiles));
            Object.freeze(config._sourceGlobs);
         }

         if (config.test)
         {
            // Create RegExp instances for any includes / excludes definitions.
            config.test._includes = config.test.includes.map((v) => new RegExp(v));
            config.test._excludes = config.test.excludes.map((v) => new RegExp(v));

            // If `config.test.sourceFiles` is not defined then hydrate `config.test.source` as source globs.
            if (!Array.isArray(config.test.sourceFiles))
            {
               const result = mainEventbus.triggerSync('typhonjs:util:file:glob:hydrate', config.test.source);

               config.test.sourceFiles = result.files;
               config.test._sourceGlobs = result.globs;
               Object.freeze(config.test._sourceGlobs);
            }
            else
            {
               // If `config.test.sourceFiles` is defined then make a copy of `test.sourceFiles` assigning it as
               // `test._sourceGlobs`.
               config.test._sourceGlobs = JSON.parse(JSON.stringify(config.test.sourceFiles));
               Object.freeze(config.test._sourceGlobs);
            }
         }

         // Deep freeze the config object. Please note that `config.sourceFiles` and `config.test.sourceFiles` is not
         // frozen as more source / test files could be added or removed during `tjsdoc-plugin-watcher` execution.
         mainEventbus.trigger('typhonjs:object:util:deep:freeze', config, ['sourceFiles']);
         mainEventbus.trigger('typhonjs:object:util:deep:freeze', pubConfig);

         // Create an event binding to return the config.
         runtimeEventProxy.on('tjsdoc:data:config:get', () => config);
         runtimeEventProxy.on('tjsdoc:data:publisher:config:get', () => pubConfig);

         // Invoke event binding to create DocDB.
         const docDB = mainEventbus.triggerSync('tjsdoc:system:docdb:create');

         // Add the docDB as a plugin making it accessible via event bindings to all plugins.
         mainEventbus.trigger('plugins:add', { name: 'tjsdoc-doc-database', instance: docDB });

         // Allow external plugins to react to final config and packageObj settings prior to generation.
         pluginManager.invokeSyncEvent('onPreGenerate', void 0, { config, docDB, packageInfo, packageObj, pubConfig });

         // Invoke the main runtime documentation generation.
         s_GENERATE(config);
      }
      catch (err)
      {
         s_ERR_HANDLER(err, config);
      }
   }
}

// Module private ---------------------------------------------------------------------------------------------------

/**
 * Respond to plugins loading and if the plugin is required from a module then attempt to load
 * `<module name>/.tjsdoc/virtual/remote` which is a standard location to store TJSDoc plugins which add
 * virtual code via the `onHandleVirtual` callback. If the path resolves then test for the `onHandleVirtual`
 * function then add it to the plugin manager. This is only enabled / useful when generating TJSDoc documentation
 * itself.
 *
 * @param {PluginData}     pluginData - The plugin data for a loaded plugin.
 *
 * @param {PluginManager}  pluginManager - The plugin manager.
 */
function s_BUILTIN_PLUGIN_VIRTUAL(pluginData, pluginManager)
{
   if (pluginData.type === 'require-module' && !pluginData.target.endsWith('.tjsdoc/virtual/remote'))
   {
      try
      {
         const virtualRemotePluginFile = `${pluginData.target}/.tjsdoc/virtual/remote`;
         const virtualRemotePlugin = require(virtualRemotePluginFile);

         if (typeof virtualRemotePlugin.onHandleVirtual === 'function')
         {
            pluginManager.add({ name: virtualRemotePluginFile });
         }
      }
      catch (err) { /* nop */ }
   }
}

/**
 * Handles any errors in pre-generation and generation.
 *
 * @param {Error}          err - An uncaught error!
 *
 * @param {TJSDocConfig}   config - The target projects config file.
 */
function s_ERR_HANDLER(err, config)
{
   let packageData;

   if (config && !config.fullStackTrace)
   {
      // Obtain a filtered stack trace from the logger.
      const traceInfo = mainEventbus.triggerSync('log:trace:info:get', err);

      // Determine if error occurred in an NPM module. If so attempt to load to any associated
      // package.json for the detected NPM module and post a fatal log message noting as much.
      if (traceInfo)
      {
         packageData = mainEventbus.triggerSync('typhonjs:util:package:object:format:from:error', traceInfo.trace);
      }
   }

   // If `_objectValidateError` is valid / true then this is a validation error via config resolution.
   if (err._objectValidateError)
   {
      mainEventbus.trigger('log:fatal',
       `The provided config file failed validation; tjsdoc (${global.$$tjsdoc_version}):`, err, '\n');
   }
   else if (typeof packageData === 'object')
   {
      let packageMessage;

      const sep =
       '-----------------------------------------------------------------------------------------------\n';

      // Create a specific message if the module is detected as a TJSDoc module.

      /* eslint-disable prefer-template */
      if (packageData.bugs.url === 'https://github.com/typhonjs-doc/tjsdoc/issues')
      {
         packageMessage = 'An uncaught fatal error has been detected with a TJSDoc module.\n'
          + 'Please report this error to the issues forum after checking if a similar '
           + 'report already exists:\n' + sep;
      }
      else
      {
         packageMessage = 'An uncaught fatal error has been detected with an external module.\n'
          + 'Please report this error to any issues forum after checking if a similar '
           + 'report already exists:\n' + sep;
      }
      /* eslint-enable prefer-template */

      packageMessage += `${packageData.formattedMessage}\ntjsdoc version: ${global.$$tjsdoc_version}`;

      // Log any uncaught errors as fatal.
      mainEventbus.trigger('log:fatal', packageMessage, sep, err, '\n');
   }
   else
   {
      // Log any uncaught errors as fatal.
      mainEventbus.trigger('log:fatal',
       `An unknown fatal error has occurred; tjsdoc (${global.$$tjsdoc_version}):`, err, '\n');
   }

   // Exit with error code of `1`.
   process.exit(1);
}

/**
 * Generate documentation.
 *
 * @param {TJSDocConfig} config - config for generation.
 */
function s_GENERATE(config)
{
   try
   {
      const docDB = mainEventbus.triggerSync('tjsdoc:data:docdb:get');
      const packageInfo = mainEventbus.triggerSync('tjsdoc:data:package:info:get');
      const packageObj = mainEventbus.triggerSync('tjsdoc:data:package:object:get');
      const pubConfig = mainEventbus.triggerSync('tjsdoc:data:publisher:config:get');
      const runtimeEventProxy = mainEventbus.triggerSync('tjsdoc:system:event:proxy:runtime:get');

      // Potentially empty `config.destination` if `config.emptyDestination` is true via `typhonjs-file-util`.
      if (config.emptyDestination) { mainEventbus.trigger('typhonjs:util:file:path:relative:empty'); }

      // Invoke `onStart` plugin callback to signal the start of TJSDoc processing.
      mainEventbus.trigger('plugins:invoke:sync:event', 'onStart', void 0,
       { config, docDB, packageInfo, packageObj, pubConfig });

      // Generate document data for all source code storing it in `docDB`.
      config.sourceFiles.forEach((filePath) => mainEventbus.trigger('tjsdoc:system:generate:source:doc:data',
       { filePath, docDB, handleError: 'log' }));

      // Invoke callback for plugins to load any virtual code.
      const virtualCode = mainEventbus.triggerSync('plugins:invoke:sync:event', 'onHandleVirtual', { code: [] }).code;

      // If there is any virtual code to load then process it. This is useful for dynamically loading external and
      // typedef code references.
      if (Array.isArray(virtualCode))
      {
         virtualCode.forEach((code) =>
         {
            // Provide a doc filter to set `builtinVirtual` to true indicating that all DocObjects added are in memory /
            // virtually generated.
            mainEventbus.triggerSync('tjsdoc:system:generate:code:doc:data', { docDB, code, docFilter: (doc) =>
            {
               doc.builtinVirtual = true;
            } });
         });
      }

      // If tests are defined then generate documentation for all test files.
      if (config.test)
      {
         // Generate document data for all test source code storing it in `docData` and `astData`.
         config.test.sourceFiles.forEach((filePath) => mainEventbus.trigger('tjsdoc:system:generate:test:doc:data',
          { filePath, docDB, handleError: 'log' }));
      }

      // Invoke core doc resolver which resolves various properties of the DocDB.
      mainEventbus.trigger('tjsdoc:system:resolver:docdb:resolve');

      // Allows any plugins to modify document database directly.
      mainEventbus.trigger('plugins:invoke:sync:event', 'onHandleDocDB', void 0, { docDB });

      mainEventbus.trigger('log:info:raw', `tjsdoc - publishing with: ${
       typeof config.publisher === 'object' ? config.publisher.name : config.publisher}`);

      // Invoke publisher which creates the final documentation output.
      mainEventbus.trigger('tjsdoc:system:publisher:publish');

      // If documentation coverage is enabled log the current source coverage.
      if (config.docCoverage) { docDB.logSourceCoverage({ includeFiles: config.docCoverageFiles }); }

      // Add event binding allowing any plugins to regenerate the documentation during the `onComplete` callback or
      // ensure that any shutdown handling completes.
      runtimeEventProxy.on('tjsdoc:system:regenerate:all:docs', () => setImmediate(s_REGENERATE));
      runtimeEventProxy.on('tjsdoc:system:shutdown', () => setImmediate(s_SHUTDOWN));

      // Invoke a final handler to plugins signalling that initial processing is complete.
      const keepAlive = mainEventbus.triggerSync('plugins:invoke:sync:event', 'onComplete', void 0,
       { config, docDB, keepAlive: false, packageInfo, packageObj, pubConfig }).keepAlive;

      // There are cases when a plugin may want to continue processing in an ongoing manner such as
      // `tjsdoc-plugin-watcher` that provides live regeneration of document generation. If keepAlive is true then
      // the plugin manager and local event bindings are not destroyed.
      if (!keepAlive) { s_SHUTDOWN(); }
   }
   catch (err)
   {
      s_ERR_HANDLER(err, config);
   }
}

/**
 * Cleans up any resources before regenerating documentation.
 */
function s_REGENERATE()
{
   const runtimeEventProxy = mainEventbus.triggerSync('tjsdoc:system:event:proxy:runtime:get');

   // Disable the regenerate and shutdown event binding.
   runtimeEventProxy.off('tjsdoc:system:regenerate:all:docs');
   runtimeEventProxy.off('tjsdoc:system:shutdown');

   // Retrieve the target project config.
   const config = mainEventbus.triggerSync('tjsdoc:data:config:get');
   const docDB = mainEventbus.triggerSync('tjsdoc:data:docdb:get');
   const packageInfo = mainEventbus.triggerSync('tjsdoc:data:package:info:get');
   const packageObj = mainEventbus.triggerSync('tjsdoc:data:package:object:get');
   const pubConfig = mainEventbus.triggerSync('tjsdoc:data:publisher:config:get');

   // Reset existing DocDB.
   mainEventbus.trigger('tjsdoc:data:docdb:reset');

   // Invoke `onRegenerate` plugin callback to signal that TJSDoc is regenerating the project target. This allows
   // any internal / external plugins to reset data as necessary.
   mainEventbus.trigger('plugins:invoke:sync:event', 'onRegenerate', void 0,
    { config, docDB, packageInfo, packageObj, pubConfig });

   // Invoke the main runtime documentation generation.
   s_GENERATE(config);
}

/**
 * Sets the TJSDoc version in `global.$$tjsdoc_version` and provides an event binding.
 *
 * @param {string}      packageFilePath - The resolved package.json for the TJSDoc runtime module.
 *
 * @param {EventProxy}  eventbus - An event proxy for the main eventbus.
 */
function s_SET_VERSION(packageFilePath, eventbus)
{
   try
   {
      const packageObj = require(packageFilePath);

      if (packageObj)
      {
         eventbus.on('tjsdoc:data:version:get', () => { return packageObj.version; });

         global.$$tjsdoc_version = packageObj.version;
      }
   }
   catch (err) { /* nop */ }
}

/**
 * Performs any final shutdown of TJSDoc which removes all event bindings from the main eventbus.
 */
function s_SHUTDOWN()
{
   // Allow any plugins a final chance to shutdown.
   mainEventbus.trigger('plugins:invoke:sync:event', 'onShutdown');

   // Remove any runtime event bindings.
   mainEventbus.triggerSync('tjsdoc:system:event:proxy:runtime:get').off();

   // Must destroy all plugins and have them and pluginManager unregister from the eventbus.
   mainEventbus.trigger('plugins:destroy:manager');
}
