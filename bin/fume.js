#!/usr/bin/env node

var nopt = require("nopt"),
    async = require("async"),
    path = require("path"),
    mkdirp = require("mkdirp"),
    fs = require("fs"),
    fume = require("../"),
    opts = {
        "sibling": Array,
        "amdify": Boolean,
        "cjsify": Boolean,
        "build": String,
        "out": String
    },
    parsed = nopt(opts, {}, process.argv, 2),
    USAGE = [
        "fume [input(s)] -s [path] -s [path] ... --amdify --cjsify --umdify",
        "\t[input]: Input file path(s)",
        "\t-s (--sibling): Path of a sibling factory",
        "\t-a (--amdify): generate an AMD module",
        "\t-c (--cjsify): generate a CJS module",
        "\t-a (--umdify): generate a UMD module",
        "\t-o (--out): output directory (optional if input is one file)",
    ].join("\n"),
    siblings = parsed.sibling || [],
    input = parsed.argv.remain,
    outDir = parsed.out,
    files = Array.prototype.concat.apply(input, siblings).map(
        function (fpath) {
            return path.normalize(
                path.join(
                    process.cwd(),
                    fpath
                )
            );
        }
    );

// arguments verification
if (process.argv.length < 3)
    usage(null, 0);
if (input.length < 1)
    usage("Missing input", 1);
if (input.length > 1 && !outDir)
    usage("Please specify an output directory", 1);
if (!(parsed.amdify || parsed.cjsify || parsed.umdify))
    usage("Choose either AMD, CJS or UMD output", 1);
if (parsed.amdify + parsed.cjsify + parsed.umdify > 1)
    usage("Choose either one type of output (AMD, CJS or UMD)", 1);

async.waterfall([

    // make sure no directories in the input list
    function (next) {

        async.each(input, function (path, done) {
            fs.stat(path, function (err, stats) {
                if (err) return done(err);
                if (stats.isDirectory())
                    return done("Cannot have a directory as input");
                done();
            });
        }, next);

    },

    // make sure no directories in the siblings list
    function (next) {

        async.each(siblings, function (path, done) {
            fs.stat(path, function (err, stats) {
                if (err) return done(err);
                if (stats.isDirectory())
                    return done("Cannot have a directory as a sibling");
                done();
            });
        }, next);

    },

    // fume files
    function (next) {

        async.map(files, function (path, done) {
            fs.readFile(path, {
                encoding: 'utf8'
            }, function (err, data) {
                done(err, {
                    path: path,
                    code: data
                });
            });
        }, function (err, codes) {
            if (err) return next(err);
            try {
                next(null, fume(codes));
            } catch (err) {
                next(err);
            }
        });

    },

    // print results
    function (sources, next) {

        if (input.length === 1 && !outDir) {
            return setImmediate(function () {
                console.log(
                    sources[files[0]][
                        parsed.amdify ? 'amdify' :
                            parsed.cjsify ? 'cjsify' :
                                'umdify'
                        ]()
                );
                next();
            });
        }

        async.each(files.slice(0, input.length), function (file, done) {
            var code, outPath, sourceBase;

            try {
                code = sources[file][
                    parsed.amdify ? 'amdify' :
                        parsed.cjsify ? 'cjsify' :
                            'umdify'
                    ]();
            } catch (err) {
                done(err);
            }

            sourceBase = path.dirname(
                path.relative(
                    process.cwd(),
                    file
                )
            );
            if (sourceBase.indexOf('..') === 0)
                sourceBase = path.relative('..', sourceBase);

            outPath = path.normalize(
                path.join(
                    process.cwd(),
                    outDir,
                    sourceBase
                )
            );

            mkdirp(outPath, function (err) {
                if (err) return done(err);
                fs.writeFile(
                    path.join(
                        outPath,
                        path.basename(file)
                    ),
                    code,
                    done
                );
            });

        }, next);

    }

], function (err) {

    if (err) {
        console.error(err);
        process.exit(1);
    }

});

function usage(msg, ret) {
    if (msg) console.error("Error:", msg, "\n");
    console.log(USAGE);
    process.exit(ret);
}
