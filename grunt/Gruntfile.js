module.exports = function(grunt) {

    var srcDir = __dirname + "/../";
    var dstDir = __dirname + "/../delivery/";
    var pkg    = grunt.file.readJSON('package.json');
    var iocore = grunt.file.readJSON('../io-core.json');

    // Project configuration.
    grunt.initConfig({
        pkg: pkg,
        clean: ['.build'],

        replace: {
            core: {
                options: {
                    patterns: [
                        {
                            match: /settings\.version             = "[\.0-9]*";/g,
                            replacement: 'settings.version             = "'+iocore.version+'";'
                        }
                    ]
                },
                files: [
                    {
                        expand:  true,
                        flatten: true,
                        src:     [srcDir + '/main.js'],
                        dest:    '.build/'
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
                            '!main.js'],
                        dest: '.build/'
                    }
                ]
            }
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
        'grunt-contrib-compress'
    ];
    var i;

    for (i in gruntTasks) {
        grunt.loadNpmTasks(gruntTasks[i]);
    }

    grunt.registerTask('default', [
        'clean',
        //'replace:core',
        //'makeEmptyDirs',
        //'copy',
        //'compress'
        'buildAllAdapters'
    ]);

};