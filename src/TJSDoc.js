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
    * Generate documentation.
    *
    * @param {TJSDocConfig} config - config for generation.
    */
   static generate(config)
   {
      const pluginManager = new PluginManager({ eventbus: mainEventbus });

      // Create an event proxy to automatically remove any additional bindings occurring during runtime.
      const localEventProxy = pluginManager.createEventProxy();

      // Load the logger plugin and enable auto plugin filters which adds inclusive filters for all plugins added.
      // In addition add inclusive log trace filter to limit info and trace to just tjsdoc source.
      pluginManager.add(
      {
         name: 'typhonjs-color-logger',
         options:
         {
            autoPluginFilters: true,
            filterConfigs:
            [
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
         s_SET_VERSION(this.tjsdocPackagePath, localEventProxy);

         const dirPath = path.resolve(__dirname);

         // Create an event binding to return a copy of the config file.
         localEventProxy.on('tjsdoc:get:config', (copy = true) => copy ? JSON.parse(JSON.stringify(config)) : config);

         // Add all virtual / remote typedef & external references from dependent NPM modules. This should only
         // be enabled when building TJSDoc documentation.
         if (typeof config.builtinPluginVirtual === 'boolean' && config.builtinPluginVirtual)
         {
            pluginManager.addAll(
            [
               { name: 'backbone-esnext-events/.tjsdoc/virtual/remote' },
               { name: 'typhonjs-plugin-manager/.tjsdoc/virtual/remote' }
            ]);

            localEventProxy.on('typhonjs:plugin:manager:added:plugin', (pluginData) =>
            {
               s_BUILTIN_PLUGIN_VIRTUAL(pluginData, pluginManager);
            });
         }

         // Ensure that `config.runtime` is defined.
         if (typeof config.runtime !== 'string' && typeof config.runtime !== 'object')
         {
            const error = new TypeError(`'config.runtime' is not an 'object' or 'string'.`);
            error._objectValidateError = true;
            throw error;
         }

         // Allow any plugins which may alter `config.runtime` a chance to do so before loading. Add
         // `config.runtimeOptions` to plugin config.
         pluginManager.add(typeof config.runtime === 'object' ? Object.assign({ options: config.runtimeOptions },
          config.runtime) : { name: config.runtime, options: config.runtimeOptions });

         mainEventbus.trigger('log:info:raw', `environment: ${process.env.TJSDOC_ENV}`);
         mainEventbus.trigger('log:info:raw', `runtime: ${
          typeof config.runtime === 'object' ? config.runtime.name : config.runtime}`);

         // Resolve the config file including any extensions and set any missing config values.
         config = mainEventbus.triggerSync('tjsdoc:config:resolver:resolve', config);

         // Add all user specified plugins.
         pluginManager.addAll(config.plugins);

         // Allow external plugins to modify the config file.
         config = pluginManager.invokeSyncEvent('onHandleConfig', { config }).config;

         // Validate the config file checking for any improper or missing values after potential user modification.
         mainEventbus.triggerSync('tjsdoc:config:resolver:validate:post', config);

         // Set log level.
         mainEventbus.trigger('log:set:level', config.logLevel);

         // Set `typhonjs-file-util` compress format / relative path and lock it from being changed.
         mainEventbus.trigger('typhonjs:util:file:set:options',
         {
            compressFormat: config.compressFormat,
            logEvent: 'log:info:raw',
            relativePath: config.destination,
            lockRelative: true }
         );

         // Make sure that either `config.source` or `config.sourceFiles` is defined.
         if (!Array.isArray(config.sourceFiles) && typeof config.source === 'undefined')
         {
            const error = new TypeError(`'config.source' or 'config.sourceFiles' is not defined.`);
            error._objectValidateError = true;
            throw error;
         }

         // The path of where TJSDoc has been executed from..
         config._dirPath = path.resolve('.');

         // Allow any plugins which may alter `config.publisher` a chance to do so before loading. Add
         // `config.publisherOptions` to plugin config.
         pluginManager.add(typeof config.publisher === 'object' ? Object.assign({ options: config.publisherOptions },
          config.publisher) : { name: config.publisher, options: config.publisherOptions });

         // Potentially empty `config.destination` if `config.emptyDestination` is true via `typhonjs-file-util`.
         if (config.emptyDestination) { mainEventbus.trigger('typhonjs:util:file:empty:relative:path'); }

         let packageObj = {};

         // Load target repo `package.json` and set event bindings for retrieving resources.
         if (config.package)
         {
            try
            {
               packageObj = require(path.resolve(config.package));

               localEventProxy.on('tjsdoc:get:package:object', () => { return packageObj; });

               // Provide an override to `typhonjs:util:package:get:data` to set the default package.
               localEventProxy.on('tjsdoc:get:package:data', (packageObject = packageObj) =>
                localEventProxy.triggerSync('typhonjs:util:package:get:data', packageObject));
            }
            catch (err)
            { /* nop */ }
         }

         // Stores all doc / tag data and eventually is loaded into the DocDB plugin.
         let docData = [];

         // Stores all parsed AST data.
         const astData = [];

         // Create an event binding to return all ast data.
         localEventProxy.on('tjsdoc:get:ast:data', () => { return astData; });

         // Invoke `onStart` plugin callback to signal the start of TJSDoc processing.
         pluginManager.invokeSyncEvent('onStart', { config });

         // Generate document data.
         this._generate(config, packageObj, docData, astData, localEventProxy);

         // Invoke callback for plugins to load any virtual code.
         const virtualCode = pluginManager.invokeSyncEvent('onHandleVirtual', void 0, { code: [] }).code;

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

         // If tests are defined then generate documentation for them.
         if (config.test) { this._generateForTest(config, docData, astData, localEventProxy); }

         // Allows any plugins to modify document data.
         docData = pluginManager.invokeSyncEvent('onHandleDocData', void 0, { docData }).docData;

         // Create an event binding to return all ast data.
         localEventProxy.on('tjsdoc:get:doc:data', () => { return docData; });

         // Optionally remove source code from all file / testFile document data.
         if (!config.includeSource)
         {
            for (const value of docData)
            {
               if (['file', 'testFile'].includes(value.kind) && 'content' in value) { value.content = ''; }
            }
         }

         // Invoke common runtime event binding to create DocDB.
         mainEventbus.trigger('tjsdoc:create:doc:db', docData);

         // Invoke core doc resolver which resolves various properties of the DocDB.
         mainEventbus.trigger('tjsdoc:core:doc:resolver:resolve');

         mainEventbus.trigger('log:info:raw', `publishing with: ${
          typeof config.publisher === 'object' ? config.publisher.name : config.publisher}`);

         // Invoke publisher which should create the final documentation output.
         mainEventbus.trigger('tjsdoc:publisher:publish', localEventProxy);

         // If documentation linting is enabled then output any lint warnings.
         if (config.docLint) { mainEventbus.trigger('tjsdoc:log:lint:doc:warnings'); }

         // Output any invalid code warnings / errors.
         mainEventbus.trigger('tjsdoc:log:invalid:code');

         // Invoke a final handler to plugins signalling that processing is complete.
         pluginManager.invokeSyncEvent('onComplete');

         // Remove any local event bindings.
         localEventProxy.destroy();

         // Must destroy all plugins and have them and pluginManager unregister from the eventbus.
         pluginManager.destroy();
      }
      catch (err)
      {
         let packageData;

         if (!config.fullStackTrace)
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
   }

   /**
    * Generate documentation for target repo code.
    *
    * @param {TJSDocConfig}      config - config for generating.
    *
    * @param {object}            packageObj - The loaded target repo package.json
    *
    * @param {DocObject[]}       docData - push DocObject to this.
    *
    * @param {ASTData[]}         astData - push ast to this.
    *
    * @param {EventProxy}        eventbus - An instance of backbone-esnext-events.
    */
   static _generate(config, packageObj, docData, astData, eventbus)
   {
      // Create RegExp instances for any includes / excludes definitions.
      const includes = config.includes.map((v) => new RegExp(v));
      const excludes = config.excludes.map((v) => new RegExp(v));

      const packageName = packageObj.name || void 0;
      const mainFilePath = packageObj.main || void 0;

      // If `config.sourceFiles` is not defined then hydrate `config.source` as source globs.
      if (!Array.isArray(config.sourceFiles))
      {
         const result = eventbus.triggerSync('typhonjs:util:file:hydrate:glob', config.source);

         config.sourceFiles = result.files;
         config._sourceGlobs = result.globs;
      }

      // Walk all source
      config.sourceFiles.forEach((filePath) =>
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

         eventbus.trigger('log:info:raw', `parse: ${filePath}`);

         const temp = eventbus.triggerSync('tjsdoc:traverse:file', config._dirPath, filePath, packageName,
          mainFilePath);

         if (!temp) { return; }

         docData.push(...temp.docData);

         astData.push({ filePath: relativeFilePath, ast: temp.ast });
      });
   }

   /**
    * Generate documentation for test code.
    *
    * @param {TJSDocConfig}   config - config for generating.
    *
    * @param {DocObject[]}    docData - push DocObject to this.
    *
    * @param {ASTData[]}      astData - push ast to this.
    *
    * @param {EventProxy}     eventbus - An instance of backbone-esnext-events.
    */
   static _generateForTest(config, docData, astData, eventbus)
   {
      const includes = config.test.includes.map((v) => new RegExp(v));
      const excludes = config.test.excludes.map((v) => new RegExp(v));

      // If `config.test.sourceFiles` is not defined then hydrate `config.test.source` as source globs.
      if (!Array.isArray(config.test.sourceFiles))
      {
         const result = eventbus.triggerSync('typhonjs:util:file:hydrate:glob', config.test.source);

         config.test.sourceFiles = result.files;
         config.test._sourceGlobs = result.globs;
      }

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
}

// Module private ---------------------------------------------------------------------------------------------------

/**
 * Sets the TJSDoc version in `global.$$tjsdoc_version` and provides an event binding.
 *
 * @param {string}      packageFilePath - The resolved package.json for the TJSDoc runtime module.
 *
 * @param {EventProxy}  eventbus - An event proxy for the main eventbus.
 *
 * @ignore
 */
const s_SET_VERSION = (packageFilePath, eventbus) =>
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
};

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
const s_BUILTIN_PLUGIN_VIRTUAL = (pluginData, pluginManager) =>
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
};
