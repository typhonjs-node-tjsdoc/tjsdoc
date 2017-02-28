/**
 * @typedef {Object} CoverageObject
 *
 * @property {string}                  coverage - ratio.
 * @property {number}                  expectCount - all identifier count.
 * @property {number}                  actualCount - documented identifier count.
 * @property {Object<string, Object>}  files - file name and coverage.
 */

/**
 * @typedef {Object} Decorator
 *
 * @property {string}   name - The decorator name.
 * @property {string}   arguments - Argument string
 */

/**
 * Parsed doc comments.
 *
 * @typedef {Object} DocObject
 */

/**
 * @typedef {Object} IceCap
 * @see https://www.npmjs.com/package/typhonjs-ice-cap
 */

/**
 * @typedef {Object} ManualConfigItem
 *
 * @property {string}   label
 * @property {string[]} paths
 * @property {string}   [fileName]
 * @property {string}   [reference]
 */

/**
 * @typedef {Object} ParsedParam
 *
 * @property {boolean}  [nullable]
 * @property {string[]} types
 * @property {boolean}  [spread]
 * @property {boolean}  [optional]
 * @property {string}   [defaultValue]
 * @property {*}        [defaultRaw]
 * @property {string}   [name]
 * @property {string}   [description]
 */

/**
 * @typedef {Object} Taffy
 * @see http://www.taffydb.com/
 */

/**
 * doc comment tag.
 *
 * @typedef {Object} Tag
 *
 * @property {string}   tagName
 * @property {*}        tagValue
 */

/**
 * Configuration for test sources.
 *
 * @typedef {Object} TestConfig
 *
 * @property {string}            type - Must be 'mocha'.
 * @property {string|string[]}   source - One or more directory paths of test source code; may be defined as globs.
 * @property {string[]}          [sourceFiles] - An array of fully resolved file paths. If defined then `config.source` is not parsed.
 * @property {string[]}          [excludes=[]]
 * @property {string[]}          [includes=['\\.(js|jsm|jsx)$']]
 */

/**
 * TJSDocCLI uses argv
 *
 * @typedef {Object} TJSDocCLIArgv
 *
 * @property {boolean}  [h] - for help
 * @property {boolean}  [help] - for help
 * @property {boolean}  [v] - for version
 * @property {boolean}  [version] - for version
 * @property {string}   [c] - for config file path
 * @property {string[]} [_] - for source directory path
 */

/**
 * The static HTML publisher options. Must be set in `config.publisherOptions`
 *
 * @typedef {Object} PubStaticHTMLConfig
 *
 * @property {object}   [manual] - Defines the manual.
 * @property {boolean}  [manual.coverage=true] - Shows the manual coverage badge
 * @property {boolean}  [manual.globalIndex]
 * @property {string}   [manual.asset]
 * @property {string}   [manual.index]
 * @property {string[]} [manual.overview]
 * @property {string[]} [manual.design]
 * @property {string[]} [manual.installation]
 * @property {string[]} [manual.usage]
 * @property {string[]} [manual.tutorial]
 * @property {string[]} [manual.configuration]
 * @property {string[]} [manual.example]
 * @property {string[]} [manual.advanced]
 * @property {string[]} [manual.faq]
 * @property {string[]} [manual.changelog]
 * @property {string[]} [scripts=[]] - File paths to additional JS browser scripts to include in static HTML output.
 * @property {string[]} [styles=[]] - File paths to additional CSS scripts to include in static HTML output.
 */

/**
 * TJSDoc config object.
 *
 * @typedef {Object} TJSDocConfig
 *
 * @property {string|string[]}   source - One or more directory paths of source code; may be defined as globs.
 * @property {string[]}          sourceFiles - An array of fully resolved file paths. Either passed into TJSDoc or populated after `source` is processed.
 * @property {string}            destination - The directory path for documentation output.
 * @property {string[]}          [access=['public', 'protected', 'private']]
 * @property {boolean}           [autoPrivate=true]
 * @property {boolean}           [builtinPluginVirtual=false] - If true then loaded plugins will search for <module>/.tjsdoc/virtual/remote to add virtual docs; This only should be used when building TJSDoc documentation.
 * @property {boolean}           [builtinVirtual=true]
 * @property {boolean}           [compactData=false] - If true then JSON output (AST & docData) is compacted.
 * @property {boolean}           [compressFormat=tar.gz] - Either `tar.gz` or `zip`; determines any archive output file extension and compression type.
 * @property {boolean}           [compressData=false] - If true then all data / JSON output (AST & docData) is compressed.
 * @property {boolean}           [compressOutput=false] - If true then all output is compressed to `docs.zip` in destination directory.
 * @property {boolean}           [copyPackage=true] - If true package.json is copied into the destination directory.
 * @property {boolean}           [docCoverage=true]
 * @property {boolean}           [debug=false]
 * @property {string}            [_dirPath] - The root directory path where TJSDoc has been invoked; set automatically.
 * @property {boolean}           [emptyDestination=false] - If true before publishing the output destination is emptied.
 * @property {string[]}          [excludes=[]]
 * @property {string|string[]}   [extends] - A string that specifies a file path to another config file or an array of strings where each additional config file extends the preceding configurations.
 * @property {boolean}           [fullStackTrace=false] - By default a log filtering mechanism is enabled to only output error logs for loaded plugins. Set to true and a full error stack trace is shown.
 * @property {string[]}          [includes=['\\.(js|jsm|jsx)$']]
 * @property {string}            [includeSource=true] - If true source code is present in file / source output.
 * @property {string}            [index='./README.md']
 * @property {string}            [docLint=true] - Provide linting information for documentation issues.
 * @property {string}            [logLevel='info'] - Sets default log level: `off`, `fatal`, `error`, `warn`, `info`, `verbose`, `debug`, `trace`.
 * @property {boolean}           [outputASTData=false] - If true then parsed AST data is output into the destination directory.
 * @property {boolean}           [outputDocData=false] - If true then raw document / tag data is output into the destination directory.
 * @property {string}            [package='./package.json']
 * @property {string[]}          [pathExtensions] - An array of path extensions for files; runtime dependent, the Babylon runtime uses: `['.js', '.jsx', '.jsm']`.
 * @property {PluginConfig[]}    [plugins] - An array of plugins to load.
 * @property {string}            [publisher] - The publisher NPM plugin or local implementation.
 * @property {object}            [publisherOptions] - Options specific to the given publisher.
 * @property {string}            [removeCommonPath=false] - If true then any common file path between all docs is removed.
 * @property {string}            [runtime] - The runtime NPM plugin or local implementation.
 * @property {object}            [runtimeOptions] - Currently unused, but options passed to the runtime module.
 * @property {string[]}          [_sourceGlobs] - The resolved source globs after `config.source` has been processed; set automatically.
 * @property {boolean}           [separateDataArchives=false] - If true the all data (AST & docData) will result in separate archives when compressing.
 * @property {string}            [title]
 * @property {TestConfig}        [test]
 * @property {boolean}           [unexportIdentifier=false]
 * @property {boolean}           [undocumentIdentifier=true]
 *
 * @see https://tjsdoc.typhonjs.io/config.html
 */
