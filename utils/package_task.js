'use strict';

/*
 * grunt-aws-lambda
 * https://github.com/Tim-B/grunt-aws-lambda
 *
 * Copyright (c) 2014 Tim-B
 * Licensed under the MIT license.
 */

var path = require('path');
var npm = require("npm");
var archive = require('archiver');
var fs = require('fs');
var tmp = require('temporary');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var dateFacade = require('./date_facade');

var packageTask = {};

packageTask.getHandler = function (grunt) {

    return function () {
        var task = this;

        var options = this.options({
            'dist_folder': 'dist',
            'include_time': true,
            'include_version': true,
            'package_folder': './',
            'include_files': []
        });

        var pkg = JSON.parse(fs.readFileSync(path.resolve(options.package_folder + '/package.json'), "utf8"));

        var dir = new tmp.Dir();
        var done = this.async();

        var time_string = 'latest';

        if (options.include_time) {
            time_string = dateFacade.getFormattedTimestamp(new Date());
        }

        var archive_name = pkg.name;

        if (options.include_version) {
            archive_name += '_' + pkg.version.replace(/\./g, '-');
        }

        archive_name += '_' + time_string;

        npm.load([], function (err, npm) {

            npm.config.set('loglevel', 'silent');

            var install_location = dir.path;
            var zip_path = install_location + '/' + archive_name + '.zip';

            npm.commands.install(install_location, options.package_folder, function () {

                var output = fs.createWriteStream(zip_path);

                /** @var Archiver  */
                var zipArchive = archive('zip');

                zipArchive.pipe(output);

                zipArchive.glob(
                    '**',
                    {
                        dot: true,
                        cwd: install_location + '/node_modules/' + pkg.name
                    },
                    {mode: 511}
                );

                if (options.include_files.length) {
                    for (var i = 0, len = options.include_files.length; i < len; i++) {
                        var path = (options.package_folder.length > 2) ? options.package_folder + '/' : options.package_folder;
                        zipArchive.file(path+options.include_files[i], {name: options.include_files[i], mode: 511});
                    }
                }

                zipArchive.finalize();

                output.on('close', function () {
                    mkdirp('./' + options.dist_folder, function (err) {
                        var dist_path = './' + options.dist_folder + '/' + archive_name + '.zip';
                        var dist_zip = fs.createWriteStream(dist_path);
                        fs.createReadStream(zip_path).pipe(dist_zip);

                        dist_zip.on('close', function () {
                            rimraf(install_location, function () {
                                grunt.config.set('lambda_deploy.' + task.target + '.package', dist_path);
                                grunt.config.set('lambda_deploy.' + task.target + '.version', pkg.version);
                                grunt.config.set('lambda_deploy.' + task.target + '.archive_name', archive_name);
                                grunt.config.set('lambda_deploy.' + task.target + '.package_name', pkg.name);
                                grunt.log.writeln('Created package at ' + dist_path);
                                done(true);
                            });
                        });
                    });
                });
            });
        });
    };
};

module.exports = packageTask;