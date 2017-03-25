#!/usr/bin/env node
import fs                  from 'fs';
import minimist            from 'minimist';
import path                from 'path';
import stripJsonComments   from 'strip-json-comments';

import TJSDoc              from './TJSDoc.js';

/**
 * Command Line Interface for TJSDoc.
 *
 * @example
 * let cli = new TJSDocCLI(process.argv);
 * cli.exec();
 */
export default class TJSDocCLI
{
   /**
    * Create instance.
    *
    * @param {Object} argv - this is node.js argv(``process.argv``)
    */
   constructor(argv)
   {
      /** @type {TJSDocCLIArgv} */
      this._argv = minimist(argv.slice(2));

      if (this._argv.h || this._argv.help)
      {
         this._showHelp();

         process.exit(0);
      }

      if (this._argv.v || this._argv.version)
      {
         this._showVersion();

         process.exit(0);
      }
   }

   /**
    * create config object from config file.
    *
    * @param {string} configPath - config file path.
    *
    * @return {TJSDocConfig} config object.
    * @private
    */
   _createConfigFromFile(configPath)
   {
      configPath = path.resolve(configPath);

      const ext = path.extname(configPath);

      if (ext === '.js')
      {
         return require(configPath);
      }
      else
      {
         const configJSON = fs.readFileSync(configPath, { encode: 'utf8' }).toString();

         return JSON.parse(stripJsonComments(configJSON));
      }
   }

   /**
    * create config object from package.json.
    *
    * @return {TJSDocConfig|null} config object.
    * @private
    */
   _createConfigFromPackageJSON()
   {
      try
      {
         const filePath = path.resolve('./package.json');
         const packageJSON = fs.readFileSync(filePath, 'utf8').toString();
         const packageObj = JSON.parse(packageJSON);

         return packageObj.tjsdoc;
      }
      catch (err) { /* nop */ }

      return null;
   }

   /**
    * execute to generate document.
    *
    * @param {Object}   [runtime=TJSDoc] - The TJSDoc runtime to invoke.
    */
   exec(runtime = TJSDoc)
   {
      let config, configPath;

      try
      {
         configPath = this._findConfigFilePath();

         if (configPath)
         {
            config = this._createConfigFromFile(configPath);
         }
         else
         {
            config = this._createConfigFromPackageJSON();
         }
      }
      catch (err)
      {
         console.error('Config loading error in TJSDocCLI.');

         if (configPath) { console.error(`File path: ${path.resolve(configPath)}`); }

         console.error(err.stack);
         process.exit(1);
      }

      try
      {
         if (config)
         {
            runtime.generate(config);
         }
         else
         {
            this._showHelp();

            process.exit(1);
         }
      }
      catch (err)
      {
         console.error('Uncaught error in TJSDocCLI:');
         console.error(err.stack);

         process.exit(1);
      }
   }

   /**
    * find TJSDoc config file.
    *
    * @returns {string|null} config file path.
    * @private
    */
   _findConfigFilePath()
   {
      if (this._argv.c) { return this._argv.c; }

      const testResolve = (configPath) =>
      {
         const filePath = path.resolve(configPath);

         fs.readFileSync(filePath);

         return filePath;
      };

      try { return testResolve('./.tjsdocrc'); }
      catch (err) { /* nop */ }

      try { return testResolve('./.tjsdocrc.js'); }
      catch (err) { /* nop */ }

      try { return testResolve('./.tjsdocrc.json'); }
      catch (err) { /* nop */ }

      try { return testResolve('./.tjsdoc.js'); }
      catch (err) { /* nop */ }

      try { return testResolve('./.tjsdoc.json'); }
      catch (err) { /* nop */ }

      return null;
   }

   /**
    * show help of TJSDoc
    *
    * @private
    */
   _showHelp()
   {
      console.log('Usage: tjsdoc [-c .tjsdocrc]');
      console.log('');
      console.log('Options:');
      console.log('  -c', 'specify config file');
      console.log('  -h', 'output usage information');
      console.log('  -v', 'output the version number');
      console.log('');
      console.log('TJSDoc finds configuration by the order:');
      console.log('  1. `-c your-tjsdocrc.json`');
      console.log('  2. `.tjsdocrc` in current directory');
      console.log('  3. `.tjsdocrc.js` in current directory');
      console.log('  4. `.tjsdocrc.json` in current directory');
      console.log('  5. `.tjsdoc.js` in current directory');
      console.log('  6. `.tjsdoc.json` in current directory');
      console.log('  7. `tjsdoc` property in package.json');
   }

   /**
    * show version of TJSDoc
    *
    * @private
    */
   _showVersion()
   {
      let packageObj = null;

      // Find package.json
      try
      {
         const packageFilePath = path.resolve(__dirname, '../package.json');
         const json = fs.readFileSync(packageFilePath, { encode: 'utf8' });

         packageObj = JSON.parse(json);
      }
      catch (err)
      { /* nop */ }

      if (packageObj)
      {
         console.log(packageObj.version);
      }
      else
      {
         console.log('0.0.0');
      }
   }
}

// If this file is directory executed, work as CLI. However in WebStorm when profiling for heap dumps the target source
// file is required be a wrapper so if `WEBSTORM_DEBUG` environment variable exists also start the CLI.
if (fs.realpathSync(process.argv[1]) === __filename)
{
   new TJSDocCLI(process.argv).exec();
}
else if (process.env.WEBSTORM_DEBUG) //
{
   new TJSDocCLI(process.argv).exec();
}
