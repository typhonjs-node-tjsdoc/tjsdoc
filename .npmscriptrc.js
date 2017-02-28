var fs =    require('fs');
var path =  require('path');

/**
 * You can provide comments in `.npmscriptrc.js`
 */
var config =
{
   "build":
   {
      "babel": { "source": "src", "destination": "dist" },

      // Copy templates
      // TODO REMOVE
//      "copy": [{ "source": "./src/Publisher/Builder/template", "destination": "./dist/Publisher/Builder/template/" }],

      // chmod the CLI entry point to executable.
      "chmod": [{ "path": "./dist/TJSDocCLI.js", "mode": "755" }]
   },

   "publish":
   {
      "prepublish": { "scripts": ["npm run eslint", "npm run test", "npm run build"] }
   },

   "test":
   {
      // Provides a `coverage` handling command that is appended when running on Travis CI.
      "travis":
      {
         "istanbul": { "command": "cover", "options": ["--report lcovonly"] },
         "report": "./node_modules/.bin/codecov"
      },

      "istanbul": { "command": "cover", "options": ["--include-all-sources --root src -x '**/template/**'"] },
      "mocha": { "source": "./node_modules/tjsdoc-tests-ecmascript/test/src", "options": ["--require tjsdoc-tests-ecmascript", "--compilers js:babel-register", "-t 120000 --recursive"] }
   },

   // For local developer testing.
   "dev_test":
   {
      "istanbul": { "command": "cover", "options": ["--include-all-sources --root src -x '**/template/**'"] },
      "mocha": { "source": "./node_modules/tjsdoc-tests-ecmascript/test/src", "options": ["--require tjsdoc-tests-ecmascript", "--compilers js:babel-register", "-t 120000 --recursive"] }
   },

   // Always tests with NPM module: tjsdoc-tests-ecmascript
   "dev_test_npm":
   {
      "mocha": { "source": "./node_modules/tjsdoc-tests-ecmascript/test/src", "options": ["--require tjsdoc-tests-ecmascript", "--compilers js:babel-register", "-t 120000 --recursive"] }
   }
};

// Detect if running in development mode and if so attempt to locate local checked out tests. If found use the local
// tests instead of the NPM module version automatically.
if (process.env.BABEL_ENV === 'tjsdoc-dev')
{
   try
   {
      var testPath = path.resolve('../tjsdoc-tests-ecmascript/package.json');

      if (fs.existsSync(testPath))
      {
         var testPackage = require(testPath);

         if (testPackage.name === 'tjsdoc-tests-ecmascript')
         {
            // Set to local tests.
            config.dev_test.mocha =
            {
               "source": "../tjsdoc-tests-ecmascript/test/src",
               "options": ["--compilers js:babel-register", "-t 120000 --recursive"]
            };
         }
      }
   }
   catch (err) { /* nop */ }
}

// Out put a message indicating which testing environment is being used of developer tests are run.
try
{
   var npmArgv = JSON.parse(process.env['npm_config_argv']).cooked;
   var npmScript = npmArgv[1];

   if (npmScript === 'dev-test' || npmScript === 'dev-test-coverage')
   {
      console.log('test location: ' + config.dev_test.mocha.source)
   }
}
catch (err) { /* nop */ }


module.exports = config;
