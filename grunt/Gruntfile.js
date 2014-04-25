module.exports = function(grunt) {

    var srcDir = __dirname + "/../";
    var dstDir = __dirname + "/../delivery/";
    var pkg    = grunt.file.readJSON('package.json');
    var iocore = grunt.file.readJSON('../io-core.json');

    // Project configuration.
    grunt.initConfig({
        pkg: pkg,
        clean: {
            all: ['.build', '.debian-control', '.debian-ready'],
            debianControl: ['.debian-ready/DEBIAN']
        },
        replace: {
            core: {
                options: {
                    patterns: [
                        {
                            match: /settings\.version             = "[\.0-9]*";/g,
                            replacement: 'settings.version = "'+iocore.version+'";'
                        }
                    ]
                },
                files: [
                    {
                        expand:  true,
                        flatten: true,
                        src:     [srcDir + 'main.js'],
                        dest:    '.build/'
                    }
                ]
            },
            debianVersion: {
                options: {
                    force: true,
                    patterns: [
                        {
                            match: 'version',
                            replacement: iocore.version
                        },
                        {
                            match: 'architecture',
                            replacement: '<%= grunt.task.current.args[2] %>'
                        },
                        {
                            match: "size",
                            replacement: '<%= grunt.task.current.args[0] %>'
                        },
                        {
                            match: "user",
                            replacement: '<%= grunt.task.current.args[1] %>'
                        }
                    ]
                },
                files: [
                    {
                        expand:  true,
                        flatten: true,
                        src:     ['debian/control/*'],
                        dest:    '.debian-control/control/'
                    },
                    {
                        expand:  true,
                        flatten: true,
                        src:     ['debian/redeb.sh'],
                        dest:    '.debian-ready/'
                    },
                    {
                        expand:  true,
                        flatten: true,
                        src:     ['debian/etc/init.d/ioBroker.sh'],
                        dest:    '.debian-control/'
                    }
                ]
            }
        },
        copy: {
            static: {
                files: [
                    {
                        expand: true,
                        cwd: srcDir,
                        src: [
                            'cert/*',
                            'doc/*',
                            'node_modules/**/*',
                            'scripts/*',
                            'www/**/*',
                            '*.json',
                            '*.js',
                            'adapter/scriptEngine/*',
                            'adapter/webServer/*',
                            'adapter/demoAdapter/*',
                            'adapter/email/*',
                            'adapter/pushover/*',
                            '!main.js',
                            '!speech.js'],
                        dest: '.build/'
                    }
                ]
            },
            debian: {
                files: [
                    {
                        expand: true,
                        cwd: '.build',
                        src: ['**/*'],
                        dest: '.debian-ready/sysroot/opt/ioBroker/'
                    },
                    {
                        expand: true,
                        cwd: '.debian-control/control',
                        src: ['**/*'],
                        dest: '.debian-ready/DEBIAN/'
                    },
                    {
                        expand: true,
                        cwd: '.debian-control/',
                        src: ['ioBroker.sh'],
                        dest: '.debian-ready/sysroot/etc/init.d/'
                    }
                ]
            }
        },
        // Javascript code styler
        jscs: {
            all: {
                src: [ "../*.js",
                    //"../scripts/*.js",
                    //"../adapter/**/*.js",
                    "Gruntfile.js"
                ],
                options: {
                    force: true,
                    "requireCurlyBraces": ["if","else","for","while","do","try","catch","case","default"],
                    "requireSpaceAfterKeywords": ["if","else","for","while","do","switch","return","try","catch"],
//                    "requireSpaceBeforeBlockStatements": true,
                    "requireParenthesesAroundIIFE": true,
                    "requireSpacesInFunctionExpression": {"beforeOpeningRoundBrace": true, "beforeOpeningCurlyBrace": true },
                    "requireSpacesInAnonymousFunctionExpression": {"beforeOpeningRoundBrace": true, "beforeOpeningCurlyBrace": true},
                    "requireSpacesInNamedFunctionExpression": {"beforeOpeningRoundBrace": true, "beforeOpeningCurlyBrace": true},
                    "requireSpacesInFunctionDeclaration": {"beforeOpeningRoundBrace": true, "beforeOpeningCurlyBrace": true},
                    "disallowMultipleVarDecl": true,
                    "requireBlocksOnNewline": true,
                    "disallowEmptyBlocks": true,
                    "disallowSpacesInsideObjectBrackets": true,
                    "disallowSpacesInsideArrayBrackets": true,
                    "disallowSpaceAfterObjectKeys": true,
                    "requireCommaBeforeLineBreak": true,
                    //"requireAlignedObjectValues": "all",
                    "requireOperatorBeforeLineBreak": ["?", "+", "-", "/","*", "=", "==", "===", "!=", "!==", ">", ">=", "<","<="],
                    "disallowLeftStickedOperators": ["?", "+", "-", "/", "*", "=", "==", "===", "!=", "!==", ">", ">=", "<", "<="],
                    "requireRightStickedOperators": ["!"],
                    "disallowRightStickedOperators": ["?", "+", "/", "*", ":", "=", "==", "===", "!=", "!==", ">", ">=", "<", "<="],
                    "requireLeftStickedOperators": [","],
                    "disallowSpaceAfterPrefixUnaryOperators": ["++", "--", "+", "-", "~", "!"],
                    "disallowSpaceBeforePostfixUnaryOperators": ["++", "--"],
                    "requireSpaceBeforeBinaryOperators": ["+","-","/","*","=","==","===","!=","!=="],
                    "requireSpaceAfterBinaryOperators": ["+", "-", "/", "*", "=", "==", "===", "!=", "!=="],
                    //"validateIndentation": 4,
                    //"validateQuoteMarks": { "mark": "\"", "escape": true },
                    "disallowMixedSpacesAndTabs": true,
                    "disallowKeywordsOnNewLine": true

                }
            }
        },
        // Lint
        jshint: {
            options: {
                force:true
            },
            all: [ "../*.js",
                "../scripts/*.js",
                "../adapter/**/*.js",
                "Gruntfile.js",
                '!../speech.js',
                '!../adapter/rpi/node_modules/**/*.js']
        },
        compress: {
            main: {
                options: {
                    archive: dstDir + 'ioBroker.core.' + iocore.version + '.zip'
                },
                files: [
                    {expand: true, src: ['**'],  dest: '/', cwd:'.build/'}
                ]
            },
            adapter: {
                options: {
                    archive: dstDir + '<%= grunt.task.current.args[1] %>'
                },
                files: [
                    {expand: true, src: ['**'],  dest: '/', cwd: srcDir + 'adapter/<%= grunt.task.current.args[0] %>/'}
                ]
            },
            debianControl: {
                options: {
                    archive: '.debian-ready/control.tar.gz'
                },
                files: [
                    {
                        expand: true,
                        src: ['**/*'],
                        dest: '/',
                        cwd: '.debian-control/control/'
                    }
                ]
            },
            debianData: {
                options: {
                    archive: '.debian-ready/data.tar.gz'
                },
                files: [
                    {
                        expand: true,
                        src: ['**/*'],
                        dest: '/',
                        cwd: '.debian-ready/sysroot/'
                    }
                ]
            },
            adapter: {
                options: {
                    archive: dstDir + '<%= grunt.task.current.args[1] %>'
                },
                files: [
                    {expand: true, src: ['**'],  dest: '/', cwd: srcDir + 'adapter/<%= grunt.task.current.args[0] %>/'}
                ]
            }
        }
    });

    grunt.registerTask('buildAllAdapters', function () {
        var dirs = {};
        grunt.file.recurse (srcDir + "/adapter/", function (abspath, rootdir, subdir, filename) {
            if (subdir.indexOf('/') != -1) {
                if (!dirs[subdir]) {
                    dirs[subdir] = {};
                }
            } else if (filename == 'Gruntfile.js') {
                if (!dirs[subdir]) {
                    dirs[subdir] = {};
                }
                dirs[subdir].grunt = true;
            }else if (filename == 'io-adapter.json') {
                if (!dirs[subdir]) {
                    dirs[subdir] = {};
                }
                dirs[subdir].packet = true;
            }
        });
        for (var t in dirs) {
            if (!dirs[t].grunt && dirs[t].packet) {
                console.log (srcDir + 'adapter/' + t + '/io-adapter.json');
                var adp = grunt.file.readJSON(srcDir + 'adapter/' + t + '/io-adapter.json');
                console.log (adp.name + adp.version);
                grunt.task.run(['compress:adapter:'+ t + ':' + adp.name + '.' + adp.version +'.zip']);
            } else
            if (dirs[t].grunt) {
                // Start gruntfile
            }
        }
    });

    grunt.registerTask('makeEmptyDirs', function () {
        grunt.file.mkdir('.build/log');
        grunt.file.mkdir('.build/datastore');
        grunt.file.mkdir('.build/tmp');
    });


    var writeVersions = {
        name: "writeVersions",
        list: [
            'replace:core'
        ]
    };

    var gruntTasks = [
        'grunt-replace',
        'grunt-contrib-clean',
        'grunt-contrib-concat',
        'grunt-contrib-copy',
        'grunt-contrib-compress',
        'grunt-contrib-jshint',
        'grunt-jscs-checker'

    ];
    var i;

    for (i in gruntTasks) {
        grunt.loadNpmTasks(gruntTasks[i]);
    }

    grunt.registerTask('debianPaket', function () {
        // Calculate size of directory
        var fs = require('fs'),
            path = require('path');

        function readDirSize(item) {
            var stats = fs.lstatSync(item);
            var total = stats.size;

            if (stats.isDirectory()) {
                var list = fs.readdirSync(item);
                for (var i = 0; i < list.length; i++) {
                    total += readDirSize(path.join(item, list[i]));
                }
                return total;
            }
            else {
                return total;
            }
        }

        var size = readDirSize('.build');

        grunt.task.run([
            'replace:debianVersion:'+(Math.round(size/1024)+8)+':pi:armhf', // Settings for raspbian
            'copy:debian',
            //'compress:debianData',
            'compress:debianControl',
            'clean:debianControl'
        ]);
        console.log('========= Copy .debian-ready directory to linux and start "sudo bash redeb.sh" =============');
    });

    grunt.registerTask('default', [
//        'jshint',
//        'jscs',
        'clean:all',
        'replace:core',
        'makeEmptyDirs',
        'copy:static',
        'compress:main',
        'buildAllAdapters',
        'debianPaket'
    ]);

};