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
       * Stores all parsed AST data.
       * @type {ASTData[]}
       */
      const astData = [];

      /**
       * Stores all doc / tag data and eventually is loaded into the DocDB plugin.
       * @type {DocObject[]}
       */
      const docData = [];

      /**
       * Stores the target project package object.
       * @type {NPMPackageObject}
       */
      let packageObj = {};

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

      runtimeEventProxy.on('tjsdoc:get:runtime:event:proxy', () => runtimeEventProxy);

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

         // Create an event binding to return a copy of the config file.
         runtimeEventProxy.on('tjsdoc:get:config', (copy = true) => copy ? JSON.parse(JSON.stringify(config)) : config);

         // Ensure that `config.runtime` is defined.
         if (config.runtime !== null && typeof config.runtime !== 'string' && typeof config.runtime !== 'object')
         {
            const error = new TypeError(`'config.runtime' is not an 'object' or 'string'.`);
            error._objectValidateError = true;
            throw error;
         }

         // Allow any plugins which may alter `config.runtime` a chance to do so before loading. Add
         // `config.runtimeOptions` to plugin config.
         pluginManager.add(typeof config.runtime === 'object' ?
          Object.assign({ options: config.runtimeOptions }, config.runtime) :
           { name: config.runtime, options: config.runtimeOptions });

         mainEventbus.trigger('log:info:raw', `environment: ${process.env.TJSDOC_ENV}`);

         mainEventbus.trigger('log:info:raw', `runtime: ${
          typeof config.runtime === 'object' ? config.runtime.name : config.runtime}`);

         // Resolve the config file including any extensions and set any default config values.
         config = mainEventbus.triggerSync('tjsdoc:config:resolver:resolve', config);

         // Add all user specified plugins.
         pluginManager.addAll(config.plugins);

         // Allow external plugins to modify the config file.
         pluginManager.invokeSyncEvent('onHandleConfig', void 0, { config });

         // Validate the config file checking for any improper or missing values after potential user modification.
         mainEventbus.triggerSync('tjsdoc:config:resolver:validate:post', config);

         // Create an event binding to return all ast data.
         runtimeEventProxy.on('tjsdoc:get:ast:data', () => { return astData; });

         // Create an event binding to return the raw doc data.
         runtimeEventProxy.on('tjsdoc:get:doc:data', () => { return docData; });

         // Create RegExp instances for any includes / excludes definitions.
         config._includes = config.includes.map((v) => new RegExp(v));
         config._excludes = config.excludes.map((v) => new RegExp(v));

         // Create an event binding to filter out source code in provided `docData` based on `config.includeSource`.
         runtimeEventProxy.on('tjsdoc:data:doc:filter:include:source', (docData) =>
         {
            // Optionally remove source code from all file / testFile document data.
            if (!config.includeSource)
            {
               for (const value of docData)
               {
                  if (['file', 'testFile'].includes(value.kind) && 'content' in value) { value.content = ''; }
               }
            }
         });

         // Set log level.
         mainEventbus.trigger('log:set:level', config.logLevel);

         // Set `typhonjs-file-util` compress format / relative path and lock it from being changed.
         mainEventbus.trigger('typhonjs:util:file:set:options',
         {
            compressFormat: config.compressFormat,
            logEvent: 'log:info:raw',
            relativePath: config.destination,
            lockRelative: true
         });

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

            runtimeEventProxy.on('typhonjs:plugin:manager:added:plugin', (pluginData) =>
            {
               s_BUILTIN_PLUGIN_VIRTUAL(pluginData, pluginManager);
            });
         }

         // Allow any plugins which may alter `config.publisher` a chance to do so before loading. Add
         // `config.publisherOptions` to the config to set particular options passed to the publisher.
         pluginManager.add(typeof config.publisher === 'object' ?
          Object.assign({ options: config.publisherOptions }, config.publisher) :
           { name: config.publisher, options: config.publisherOptions });

         // Load target repo `package.json`
         if (config.package)
         {
            try
            {
               packageObj = require(path.resolve(config.package));
            }
            catch (err)
            { /* nop */ }
         }

         // set event bindings for retrieving `package.json` related resources.
         runtimeEventProxy.on('tjsdoc:get:package:object', () => { return packageObj; });

         // Provide an override to `typhonjs:util:package:get:data` to set the default package.
         runtimeEventProxy.on('tjsdoc:get:package:data', (packageObject = packageObj) =>
          runtimeEventProxy.triggerSync('typhonjs:util:package:get:data', packageObject));

         // If `config.sourceFiles` is not defined then hydrate `config.source` as source globs.
         if (!Array.isArray(config.sourceFiles))
         {
            const result = mainEventbus.triggerSync('typhonjs:util:file:hydrate:glob', config.source);

            config.sourceFiles = result.files;
            config._sourceGlobs = result.globs;
         }
         else
         {
            // If `config.sourceFiles` is defined then make a copy of `sourceFiles` assigning it as `_sourceGlobs`.
            config._sourceGlobs = JSON.parse(JSON.stringify(config.sourceFiles));
         }

         if (config.test)
         {
            // If `config.test.sourceFiles` is not defined then hydrate `config.test.source` as source globs.
            if (!Array.isArray(config.test.sourceFiles))
            {
               const result = mainEventbus.triggerSync('typhonjs:util:file:hydrate:glob', config.test.source);

               config.test.sourceFiles = result.files;
               config.test._sourceGlobs = result.globs;
            }
            else
            {
               // If `config.test.sourceFiles` is defined then make a copy of `test.sourceFiles` assigning it as
               // `test._sourceGlobs`.
               config.test._sourceGlobs = JSON.parse(JSON.stringify(config.test.sourceFiles));
            }
         }

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
      const traceInfo = mainEventbus.triggerSync('log:get:trace:info', err);

      // Determine if error occurred in an NPM module. If so attempt to load to any associated
      // package.json for the detected NPM module and post a fatal log message noting as much.
      packageData = mainEventbus.triggerSync('typhonjs:util:package:get:data:from:error', traceInfo.trace);
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
      const dirPath = path.resolve(__dirname);

      const runtimeEventProxy = mainEventbus.triggerSync('tjsdoc:get:runtime:event:proxy');

      const astData = mainEventbus.triggerSync('tjsdoc:get:ast:data');
      const docData = mainEventbus.triggerSync('tjsdoc:get:doc:data');
      const packageObj = mainEventbus.triggerSync('tjsdoc:get:package:object');

      // Potentially empty `config.destination` if `config.emptyDestination` is true via `typhonjs-file-util`.
      if (config.emptyDestination) { mainEventbus.trigger('typhonjs:util:file:empty:relative:path'); }

      // Invoke `onStart` plugin callback to signal the start of TJSDoc processing.
      mainEventbus.trigger('plugins:invoke:sync:event', 'onStart', { config });

      // Generate document data for all source code storing it in `docData` and `astData`. Also sets up the runtime
      // event bindings for single file generation which any plugin may utilize.
      s_GENERATE_ALL_FILES(config, packageObj, docData, astData, runtimeEventProxy);

      // Invoke callback for plugins to load any virtual code.
      const virtualCode = mainEventbus.triggerSync('plugins:invoke:sync:event', 'onHandleVirtual', { code: [] }).code;

      // If there is any virtual code to load then process it. This is useful for dynamically loading external and
      // typedef code references.
      if (Array.isArray(virtualCode))
      {
         virtualCode.forEach((code) =>
         {
            const temp = mainEventbus.triggerSync('tjsdoc:traverse:code', dirPath, code);

            if (temp !== null && Array.isArray(temp.docData))
            {
               temp.docData.forEach((v) => v.builtinVirtual = true);

               docData.push(...temp.docData);
            }
         });
      }

      // If tests are defined then generate documentation for all test files.
      if (config.test) { s_GENERATE_ALL_TESTS(config, docData, astData, runtimeEventProxy); }

      // Allows any plugins to modify document data.
      mainEventbus.trigger('plugins:invoke:sync:event', 'onHandleDocData', void 0, { docData });

      // Remove source code from file and test file doc data if `config.includeSource` is false.
      mainEventbus.trigger('tjsdoc:data:doc:filter:include:source', docData);

      // Invoke common runtime event binding to create DocDB.
      const docDB = mainEventbus.triggerSync('tjsdoc:data:docdb:create', docData);

      // Add the docDB as a plugin making it accessible via event bindings to all plugins.
      mainEventbus.trigger('plugins:add', { name: 'tjsdoc-doc-database', instance: docDB });

      // Allows any plugins to modify document database directly.
      mainEventbus.trigger('plugins:invoke:sync:event', 'onHandleDocDB', void 0, { docDB });

      // Invoke core doc resolver which resolves various properties of the DocDB.
      mainEventbus.trigger('tjsdoc:core:doc:resolver:resolve');

      mainEventbus.trigger('log:info:raw', `publishing with: ${
       typeof config.publisher === 'object' ? config.publisher.name : config.publisher}`);

      // Create an event proxy specifically for invoking the publisher module. In certain situations like
      // in a plugin that provides file watch / incremental documentation generation the publisher may be invoked
      // many times, so pass in a proxy and destroy it after to clean up any resources to ensure that publishing
      // can be invoked again.
      const publishEventProxy = mainEventbus.triggerSync('plugins:create:event:proxy');

      // Invoke publisher which should create the final documentation output.
      mainEventbus.trigger('tjsdoc:publisher:publish', publishEventProxy);

      // Destroy the publisher event proxy.
      publishEventProxy.destroy();

      // If documentation linting is enabled then output any lint warnings.
      if (config.docLint) { mainEventbus.trigger('tjsdoc:log:lint:doc:warnings'); }

      // Output any invalid code warnings / errors.
      mainEventbus.trigger('tjsdoc:invalid:code:log');

      // Add event binding allowing any plugins to regenerate the documentation during the `onComplete` callback.
      mainEventbus.on('tjsdoc:regenerate', s_REGENERATE);

      // Invoke a final handler to plugins signalling that initial processing is complete.
      const keepAlive = mainEventbus.triggerSync('plugins:invoke:sync:event', 'onComplete', void 0,
       { keepAlive: false }).keepAlive;

      // There are cases when a plugin may want to continue processing in an ongoing manner such as
      // `tjsdoc-plugin-watcher` that provides live regeneration of document generation. If keepAlive is true then
      // the plugin manager and local event bindings are not destroyed.
      if (!keepAlive)
      {
         // Remove any runtime event bindings.
         mainEventbus.triggerSync('tjsdoc:get:runtime:event:proxy').off();

         // Must destroy all plugins and have them and pluginManager unregister from the eventbus.
         mainEventbus.trigger('plugins:destroy:manager');
      }
   }
   catch (err)
   {
      s_ERR_HANDLER(err, config);
   }
}

/**
 * Generate all documentation for target project.
 *
 * @param {TJSDocConfig}      config - config for generating.
 *
 * @param {NPMPackageObject}  packageObj - The target project package object.
 *
 * @param {DocObject[]}       docData - The target project DocObject data.
 *
 * @param {ASTData[]}         astData - The target project AST data.
 *
 * @param {EventProxy}        eventbus - An instance of backbone-esnext-events.
 */
function s_GENERATE_ALL_FILES(config, packageObj, docData, astData, eventbus)
{
   const packageName = packageObj.name || void 0;
   const mainFilePath = packageObj.main || void 0;

   // Walk all source.
   config.sourceFiles.forEach(
    (filePath) => s_GENERATE_FILE(filePath, config, packageName, mainFilePath, docData, astData, eventbus));

   // Create event binding for s_GENERATE_FILE
   eventbus.on('tjsdoc:file:generate:doc:data:log:errors',
    (filePath, docData = [], astData = [], logErrors = true) =>
     s_GENERATE_FILE(filePath, config, packageName, mainFilePath, docData, astData, eventbus, logErrors), this);

   // Create event binding for s_GENERATE_FILE that automatically throws errors.
   eventbus.on('tjsdoc:file:generate:doc:data:throw:errors',
    (filePath, docData = [], astData = [], logErrors = false) =>
     s_GENERATE_FILE(filePath, config, packageName, mainFilePath, docData, astData, eventbus, logErrors), this);
}

/**
 * Generate documentation for test code.
 *
 * @param {TJSDocConfig}   config - config for generating.
 *
 * @param {DocObject[]}       docData - The target project DocObject data.
 *
 * @param {ASTData[]}         astData - The target project AST data.
 *
 * @param {EventProxy}     eventbus - An instance of backbone-esnext-events.
 */
function s_GENERATE_ALL_TESTS(config, docData, astData, eventbus)
{
   const includes = config.test.includes.map((v) => new RegExp(v));
   const excludes = config.test.excludes.map((v) => new RegExp(v));

   config.test.sourceFiles.forEach((filePath) =>
   {
      const relativeFilePath = path.relative(config._dirPath, filePath);

      let match = false;

      for (const reg of includes)
      {
         if (relativeFilePath.match(reg))
         {
            match = true;
            break;
         }
      }

      if (!match) { return; }

      for (const reg of excludes)
      {
         if (relativeFilePath.match(reg)) { return; }
      }

      mainEventbus.trigger('log:info:raw', `parse: ${filePath}`);

      const temp = eventbus.triggerSync('tjsdoc:traverse:test', config.test.type, config._dirPath, filePath);

      if (!temp) { return; }

      docData.push(...temp.docData);

      astData.push({ filePath: `test${path.sep}${relativeFilePath}`, ast: temp.ast });
   });
}

/**
 * Generates doc data from a file path and supporting data. Please see the `tjsdoc:file:generate:doc:data` event
 * binding which provides a simpler invocation pattern.
 *
 * @param {string}         filePath - Doc data is generated from this file path.
 *
 * @param {TJSDocConfig}   config - config for generating.
 *
 * @param {string}         [packageName] - Package name of the target project.
 *
 * @param {string}         [mainFilePath] - Main entry point from `package.json` of the target project.
 *
 * @param {DocObject[]}    [docData] - DocObject data is pushed to this array.
 *
 * @param {ASTData[]}      [astData] - AST data is pushed to this array.
 *
 * @param {EventProxy}     eventbus - An instance of backbone-esnext-events.
 *
 * @param {boolean}        [logErrors] - When true errors are silently logged with InvalidCodeLogger. When false
 *                                       parsing errors are thrown which is useful when watching files.
 *
 * @returns {*}
 * @private
 */
function s_GENERATE_FILE(filePath, config, packageName, mainFilePath, docData = [], astData = [], eventbus, logErrors)
{
   const relativeFilePath = path.relative(config._dirPath, filePath);

   let match = false;

   for (const reg of config._includes)
   {
      if (relativeFilePath.match(reg))
      {
         match = true;
         break;
      }
   }

   if (!match) { return void 0; }

   for (const reg of config._excludes)
   {
      if (relativeFilePath.match(reg)) { return void 0; }
   }

   eventbus.trigger('log:info:raw', `parse: ${filePath}`);

   const temp = eventbus.triggerSync('tjsdoc:traverse:file', config._dirPath, filePath, packageName, mainFilePath,
    logErrors);

   if (!temp) { return void 0; }

   docData.push(...temp.docData);

   astData.push({ filePath: relativeFilePath, ast: temp.ast });

   return { docData, astData };
}

/**
 * Cleans up any resources before regenerating documentation.
 */
function s_REGENERATE()
{
   // Disable the regenerate event binding.
   mainEventbus.off('tjsdoc:regenerate', s_REGENERATE);

   // Retrieve the target project config.
   const config = mainEventbus.triggerSync('tjsdoc:get:config', false);

   // Remove any existing DocDB.
   mainEventbus.trigger('plugins:remove', 'tjsdoc-doc-database');

   // Remove existing file doc dat generation event bindings.
   mainEventbus.off('tjsdoc:file:generate:doc:data:log:errors');
   mainEventbus.off('tjsdoc:file:generate:doc:data:throw:errors');

   // Reset AST and doc data.
   mainEventbus.triggerSync('tjsdoc:get:ast:data').length = 0;
   mainEventbus.triggerSync('tjsdoc:get:doc:data').length = 0;

   // Invoke `onRegenerate` plugin callback to signal that TJSDoc is regenerating the project target. This allows
   // any internal / external plugins to reset data as necessary.
   mainEventbus.trigger('plugins:invoke:sync:event', 'onRegenerate', { config });

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
         eventbus.on('tjsdoc:get:version', () => { return packageObj.version; });

         global.$$tjsdoc_version = packageObj.version;
      }
   }
   catch (err) { /* nop */ }
}
