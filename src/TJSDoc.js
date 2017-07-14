import mainEventbus  from 'backbone-esnext-eventbus';
import path          from 'path';
import PluginManager from 'typhonjs-plugin-manager';

// Only load one instance of `babel-polyfill`.
if (!global._babelPolyfill) { require('babel-polyfill'); }

// Set `TJSDOC_ENV` environment variable to standard (published modules) unless `BABEL_ENV` is `tjsdoc-dev`.
process.env.TJSDOC_ENV = process.env.BABEL_ENV === 'tjsdoc-dev' ? 'development' : 'standard';

// A prepend string for logging to indicate TJSDoc module.
const s_LOG_PREPEND = 'tjsdoc - ';

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
    * @param {TJSDocConfig} mainConfig - config for pre-generation validation and loading.
    */
   static async generate(mainConfig)
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
      await pluginManager.addAsync(
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
         if (typeof mainConfig !== 'object') { throw new TypeError(`'mainConfig' is not an 'object'`); }

         // Set `global.$$tjsdoc_version` and add an event binding to get the TJSDoc version.
         s_SET_VERSION(this.tjsdocPackagePath, runtimeEventProxy);

         // Ensure that `mainConfig.runtime` is defined.
         if (mainConfig.runtime !== null && typeof mainConfig.runtime !== 'string' &&
          typeof mainConfig.runtime !== 'object')
         {
            const error = new TypeError(`'mainConfig.runtime' is not an 'object' or 'string'.`);
            error._objectValidateError = true;
            throw error;
         }

         // Allow any plugins which may alter `mainConfig.publisher` a chance to do so before loading. Add
         // `mainConfig.publisherOptions` to the mainConfig to set particular options passed to the publisher.
         await pluginManager.addAsync(typeof mainConfig.publisher === 'object' ?
          Object.assign({ options: mainConfig.publisherOptions }, mainConfig.publisher) :
           { name: mainConfig.publisher, options: mainConfig.publisherOptions });

         // Allow any plugins which may alter `mainConfig.runtime` a chance to do so before loading. Add
         // `mainConfig.runtimeOptions` to plugin mainConfig.
         await pluginManager.addAsync(typeof mainConfig.runtime === 'object' ?
          Object.assign({ options: mainConfig.runtimeOptions }, mainConfig.runtime) :
           { name: mainConfig.runtime, options: mainConfig.runtimeOptions });

         mainEventbus.trigger('log:info:raw', `tjsdoc - environment: ${process.env.TJSDOC_ENV}`);

         mainEventbus.trigger('log:info:raw', `tjsdoc - runtime: ${
          typeof mainConfig.runtime === 'object' ? mainConfig.runtime.name : mainConfig.runtime}`);

         // Resolve the mainConfig file including any extensions and set any default mainConfig values.
         mainConfig = mainEventbus.triggerSync('tjsdoc:system:config:resolver:resolve', mainConfig);

         const pubConfig = mainConfig.publisherOptions || {};

         // Add all user specified plugins.
         await pluginManager.addAllAsync(mainConfig.plugins);

         // Allow external plugins to modify the mainConfig file.
         await pluginManager.invokeAsyncEvent('onHandleConfigAsync', void 0, { mainConfig, pubConfig });

         // Validate the mainConfig file checking for any improper or missing values after potential user modification.
         mainEventbus.triggerSync('tjsdoc:system:config:resolver:validate:post', mainConfig);

         // Set log level.
         mainEventbus.trigger('log:level:set', mainConfig.logLevel);

         // Set `typhonjs-file-util` compress format / relative path and lock it from being changed.
         mainEventbus.trigger('typhonjs:util:file:options:set',
         {
            compressFormat: mainConfig.compressFormat,
            logEvent: 'log:info:raw',
            relativePath: mainConfig.destination,
            lockRelative: true
         });

         // Create RegExp instances for any includes / excludes definitions.
         mainConfig._includes = mainConfig.includes.map((v) => new RegExp(v));
         mainConfig._excludes = mainConfig.excludes.map((v) => new RegExp(v));

         // Make sure that either `mainConfig.source` or `mainConfig.sourceFiles` is defined.
         if (!Array.isArray(mainConfig.sourceFiles) && typeof mainConfig.source === 'undefined')
         {
            const error = new TypeError(`'mainConfig.source' or 'mainConfig.sourceFiles' is not defined.`);
            error._objectValidateError = true;
            throw error;
         }

         // The current working path of where TJSDoc has been executed from; the target project.
         mainConfig._dirPath = process.cwd();

         // Add all virtual / remote typedef & external references from dependent NPM modules. This should only
         // be enabled when building documentation for TJSDoc itself.
         if (typeof mainConfig.builtinPluginVirtual === 'boolean' && mainConfig.builtinPluginVirtual)
         {
            await pluginManager.addAllAsync(
            [
               { name: 'backbone-esnext-events/.tjsdoc/virtual/remote' },
               { name: 'typhonjs-plugin-manager/.tjsdoc/virtual/remote' }
            ]);

            runtimeEventProxy.on('typhonjs:plugin:manager:plugin:added', async (pluginData) =>
            {
               await s_BUILTIN_PLUGIN_VIRTUAL(pluginData, pluginManager);
            });
         }

         // Load target repo `package.json`
         if (mainConfig.package)
         {
            try
            {
               packageObj = require(path.resolve(mainConfig.package));
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

         // If `mainConfig.sourceFiles` is not defined then hydrate `mainConfig.source` as source globs.
         if (!Array.isArray(mainConfig.sourceFiles))
         {
            const result = mainEventbus.triggerSync('typhonjs:util:file:glob:hydrate', mainConfig.source);

            mainConfig.sourceFiles = result.files;
            mainConfig._sourceGlobs = result.globs;
            Object.freeze(mainConfig._sourceGlobs);
         }
         else
         {
            // If `mainConfig.sourceFiles` is defined then make a copy of `sourceFiles` assigning it as `_sourceGlobs`.
            mainConfig._sourceGlobs = JSON.parse(JSON.stringify(mainConfig.sourceFiles));
            Object.freeze(mainConfig._sourceGlobs);
         }

         if (mainConfig.test)
         {
            // Create RegExp instances for any includes / excludes definitions.
            mainConfig.test._includes = mainConfig.test.includes.map((v) => new RegExp(v));
            mainConfig.test._excludes = mainConfig.test.excludes.map((v) => new RegExp(v));

            // If `mainConfig.test.sourceFiles` is not defined then hydrate `mainConfig.test.source` as source globs.
            if (!Array.isArray(mainConfig.test.sourceFiles))
            {
               const result = mainEventbus.triggerSync('typhonjs:util:file:glob:hydrate', mainConfig.test.source);

               mainConfig.test.sourceFiles = result.files;
               mainConfig.test._sourceGlobs = result.globs;
               Object.freeze(mainConfig.test._sourceGlobs);
            }
            else
            {
               // If `mainConfig.test.sourceFiles` is defined then make a copy of `test.sourceFiles` assigning it as
               // `test._sourceGlobs`.
               mainConfig.test._sourceGlobs = JSON.parse(JSON.stringify(mainConfig.test.sourceFiles));
               Object.freeze(mainConfig.test._sourceGlobs);
            }
         }

         // Deep freeze the mainConfig object. Please note that `mainConfig.sourceFiles` and
         // `mainConfig.test.sourceFiles` is not frozen as more source / test files could be added or removed during
         // `tjsdoc-plugin-watcher` execution.
         mainEventbus.trigger('typhonjs:object:util:deep:freeze', mainConfig, ['_mainMenuLinks', 'sourceFiles']);
         mainEventbus.trigger('typhonjs:object:util:deep:freeze', pubConfig, ['_mainMenuLinks']);

         // Create an event binding to return the mainConfig.
         runtimeEventProxy.on('tjsdoc:data:config:main:get', () => mainConfig);
         runtimeEventProxy.on('tjsdoc:data:config:publisher:get', () => pubConfig);

         // Invoke event binding to create DocDB.
         const docDB = mainEventbus.triggerSync('tjsdoc:system:docdb:create');

         // Add the docDB as a plugin making it accessible via event bindings to all plugins.
         await mainEventbus.triggerAsync('plugins:async:add', { name: 'tjsdoc-doc-database', instance: docDB });

         // Allow external plugins to react to final config and packageObj settings prior to generation.
         await pluginManager.invokeAsyncEvent('onRuntimePreGenerateAsync', void 0,
          { mainConfig, docDB, packageInfo, packageObj, pubConfig });

         // Invoke the main runtime documentation generation.
         await s_GENERATE();
      }
      catch (err)
      {
         s_ERR_HANDLER(err, mainConfig);
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
async function s_BUILTIN_PLUGIN_VIRTUAL(pluginData, pluginManager)
{
   if (pluginData.type === 'require-module' && !pluginData.target.endsWith('.tjsdoc/virtual/remote'))
   {
      try
      {
         const virtualRemotePluginFile = `${pluginData.target}/.tjsdoc/virtual/remote`;
         const virtualRemotePlugin = require(virtualRemotePluginFile);

         if (typeof virtualRemotePlugin.onHandleVirtual === 'function')
         {
            await pluginManager.addAsync({ name: virtualRemotePluginFile });
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
 * @param {TJSDocConfig}   mainConfig - The target projects config file.
 */
function s_ERR_HANDLER(err, mainConfig)
{
   let packageData;

   if (mainConfig && !mainConfig.fullStackTrace)
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
 * @param {TJSDocConfig} mainConfig - config for generation.
 */
async function s_GENERATE()
{
   const mainConfig = mainEventbus.triggerSync('tjsdoc:data:config:main:get');

   try
   {
      const docDB = mainEventbus.triggerSync('tjsdoc:data:docdb:get');
      const packageInfo = mainEventbus.triggerSync('tjsdoc:data:package:info:get');
      const packageObj = mainEventbus.triggerSync('tjsdoc:data:package:object:get');
      const pubConfig = mainEventbus.triggerSync('tjsdoc:data:config:publisher:get');
      const runtimeEventProxy = mainEventbus.triggerSync('tjsdoc:system:event:proxy:runtime:get');

      // Potentially empty `mainConfig.destination` if `mainConfig.emptyDestination` is true via `typhonjs-file-util`.
      if (mainConfig.emptyDestination)
      {
         mainEventbus.trigger('typhonjs:util:file:path:relative:empty', { logPrepend: s_LOG_PREPEND });
      }

      // Invoke `onStart` plugin callback to signal the start of TJSDoc processing.
      await mainEventbus.triggerAsync('plugins:async:invoke:event', 'onRuntimeStartAsync', void 0,
       { mainConfig, docDB, packageInfo, packageObj, pubConfig });

      // Generate document data for all source code storing it in `docDB`.
      mainConfig.sourceFiles.forEach((filePath) => mainEventbus.trigger('tjsdoc:system:generate:source:doc:data',
       { filePath, docDB, handleError: 'log' }));

      // Invoke callback for plugins to load any virtual code.
      const virtualCode = (await mainEventbus.triggerAsync('plugins:async:invoke:event', 'onHandleVirtualAsync',
       { code: [] })).code;

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
      if (mainConfig.test)
      {
         // Generate document data for all test source code storing it in `docData` and `astData`.
         mainConfig.test.sourceFiles.forEach((filePath) => mainEventbus.trigger('tjsdoc:system:generate:test:doc:data',
          { filePath, docDB, handleError: 'log' }));
      }

      // Invoke core doc resolver which resolves various properties of the DocDB.
      mainEventbus.trigger('tjsdoc:system:resolver:docdb:resolve');

      // Allows any plugins to modify document database directly.
      await mainEventbus.triggerAsync('plugins:async:invoke:event', 'onHandleDocDBAsync', void 0, { docDB });

      mainEventbus.trigger('log:info:raw', `tjsdoc - publishing with: ${
       typeof mainConfig.publisher === 'object' ? mainConfig.publisher.name : mainConfig.publisher}`);

      await mainEventbus.triggerAsync('tjsdoc:system:publisher:publish');

      // If documentation coverage is enabled log the current source coverage.
      if (mainConfig.docCoverage) { docDB.logSourceCoverage({ includeFiles: mainConfig.docCoverageFiles }); }

      // Add event binding allowing any plugins to regenerate the documentation during the `onComplete` callback or
      // ensure that any shutdown handling completes.
      runtimeEventProxy.on('tjsdoc:system:regenerate:all:docs', () => setImmediate(s_REGENERATE));
      runtimeEventProxy.on('tjsdoc:system:shutdown', () => setImmediate(s_SHUTDOWN));

      // Invoke a final handler to plugins signalling that initial processing is complete.
      const keepAlive = (await mainEventbus.triggerAsync('plugins:async:invoke:event', 'onRuntimeCompleteAsync', void 0,
       { mainConfig, docDB, keepAlive: false, packageInfo, packageObj, pubConfig })).keepAlive;

      // There are cases when a plugin may want to continue processing in an ongoing manner such as
      // `tjsdoc-plugin-watcher` that provides live regeneration of document generation. If keepAlive is true then
      // the plugin manager and local event bindings are not destroyed.
      if (!keepAlive) { await s_SHUTDOWN(); }
   }
   catch (err)
   {
      s_ERR_HANDLER(err, mainConfig);
   }
}

/**
 * Cleans up any resources before regenerating documentation.
 */
async function s_REGENERATE()
{
   const runtimeEventProxy = mainEventbus.triggerSync('tjsdoc:system:event:proxy:runtime:get');

   // Disable the regenerate and shutdown event binding.
   runtimeEventProxy.off('tjsdoc:system:regenerate:all:docs');
   runtimeEventProxy.off('tjsdoc:system:shutdown');

   // Retrieve the target project config.
   const mainConfig = mainEventbus.triggerSync('tjsdoc:data:config:main:get');
   const docDB = mainEventbus.triggerSync('tjsdoc:data:docdb:get');
   const packageInfo = mainEventbus.triggerSync('tjsdoc:data:package:info:get');
   const packageObj = mainEventbus.triggerSync('tjsdoc:data:package:object:get');
   const pubConfig = mainEventbus.triggerSync('tjsdoc:data:config:publisher:get');

   // Reset existing DocDB.
   mainEventbus.trigger('tjsdoc:data:docdb:reset');

   // Invoke `onRegenerate` plugin callback to signal that TJSDoc is regenerating the project target. This allows
   // any internal / external plugins to reset data as necessary.
   await mainEventbus.triggerAsync('plugins:async:invoke:event', 'onRuntimeRegenerateAsync', void 0,
    { mainConfig, docDB, packageInfo, packageObj, pubConfig });

   // Invoke the main runtime documentation generation.
   await s_GENERATE();
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
async function s_SHUTDOWN()
{
   // Allow any plugins a final chance to shutdown.
   await mainEventbus.triggerAsync('plugins:async:invoke:event', 'onRuntimeShutdownAsync');

   // Remove any runtime event bindings.
   mainEventbus.triggerSync('tjsdoc:system:event:proxy:runtime:get').off();

   // Must destroy all plugins and have them and pluginManager unregister from the eventbus.
   await mainEventbus.triggerAsync('plugins:async:destroy:manager');
}
