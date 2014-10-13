(function(undefined) {

    var path = require('path'),
        parse = require('esprima').parse,
        generate = require('escodegen').generate;

    var CJS_TEMPLATE = {
            START: "module.exports = (",
            // <-- factory function -->
            MIDDLE: ")(",
            // <-- requires -->
            END: ");"
        },
        AMD_TEMPLATE = {
            START: "define([",
            // <-- dependencies -->
            MIDDLE: "],",
            // <-- factory function -->
            END: ");"
        };

    // defaults
    var NAME_TAG_PREFIX = "@name",
        PREFER_TAG_PREFIX = "@prefer",
        AMD_TAG_PREFIX = "@amd",
        CJS_TAG_PREFIX = "@cjs";

    // pre-factory comment regex:
    var cmtLinesRe = new RegExp("^([\\s\\S]*?)\\s*function", "m");

    /**
     * Parse the list of sources
     */
    function Fume(sources, config) {

        config = config || {};
        config.nameTagPrefix = config.nameTagPrefix || NAME_TAG_PREFIX;
        config.preferTagPrefix = config.preferTagPrefix || PREFER_TAG_PREFIX;
        config.amdTagPrefix = config.amdTagPrefix || AMD_TAG_PREFIX;
        config.cjsTagPrefix = config.cjsTagPrefix || CJS_TAG_PREFIX;
        this.config = config;

        var nameTagRe = new RegExp(
                "^.*?" +
                this.config.nameTagPrefix +
                "\\s*(\\w+)\\W*$"
            ),
            preferTagRe = new RegExp(
                "^.*?" +
                this.config.preferTagPrefix +
                "\\s*(\\S+)\\s+(\\S+)\\W*$"
            ),
            amdTagRe = new RegExp(
                "^.*?" +
                this.config.amdTagPrefix +
                "\\s*(\\S+)\\s+(\\S+)\\W*$"
            ),
            cjsTagRe = new RegExp(
                "^.*?" +
                this.config.cjsTagPrefix +
                "\\s*(\\S+)\\s+(\\S+)\\W*$"
            );

        // parse the sources and get needed information
        sources.forEach(function(source) {

            source.dir = path.dirname(source.path);
            source.tree = parse(source.code);
            source.factory = source.tree.body[0];
            source.amdMaps = {};
            source.cjsMaps = {};
            source.preferMaps = {};

            if (source.factory.type !== 'FunctionDeclaration')
                throw Error("Expected a factory function at '" +
                    source.path + "'");

            source.args = source.factory.params;

            // get comment lines before the factory function:
            var m = source.code.match(cmtLinesRe);
            // this RegExp should always match
            if (!m) throw Error("Unable to parse pre-factory annotation");
            var cLines = m[1].split(/[\n\r]/);

            // extract annotation from the comment lines:
            cLines.forEach(function(line) {

                // attempt to detect the factory name:

                // first try:
                // the parse tree doesn't include comments, so we need to look
                // at the source. a simple regex to detect the @name tag
                // anywhere before the factory function:
                var m = line.match(nameTagRe);
                if (m) source.name = m[1];

                // second try:
                // if name tag isn't specified, take the function's name:
                source.name = source.name || source.factory.id.name;

                // check if this name is already taken by another factory:
                if (sources.some(function(other) {
                        return other !== source &&
                            other.dir === source.dir &&
                            other.name === source.name;
                    }))
                    throw Error(
                        "Factory path '" +
                        path.join(source.dir, source.name) +
                        "' cannot be specified more than once"
                    );

                // detect prefer mapping:
                m = line.match(preferTagRe);
                if (m) source.preferMaps[m[1]] = m[2];

                // detect AMD mapping:
                m = line.match(amdTagRe);
                if (m) source.amdMaps[m[1]] = m[2];

                // detect CJS mapping:
                m = line.match(cjsTagRe);
                if (m) source.cjsMaps[m[1]] = m[2];

            });

        });

        // detect sibling dependencies
        sources.forEach(function(source) {

            source.factory.params.forEach(function(param) {

                // find the siblings which can qualify as this dependency
                param.candidatePaths = sources.filter(function(other) {
                    return other !== source && other.name === param.name;
                }).map(function(other) {
                    return other.path;
                });

            });

        });

        return sources.reduce(function(p, e, i, o) {
            p[e.path] = new Factory(e);
            return p;
        }, {});

    }

    function Factory(source) {
        this.name = source.name;
        this.dir = source.dir;
        this.code = source.code;
        this.deps = source.factory.params;
        this.cjsMaps = source.cjsMaps;
        this.amdMaps = source.amdMaps;
        this.preferMaps = source.preferMaps;
    }

    /**
     * Return code of this factory wrapped as an amd module, with dependencies
     * mapped and resolved according to annotations.
     */
    Factory.prototype.amdify = function() {

        var self = this,
            deps = self.deps.map(function(dep) {

                if (dep.candidatePaths.length > 0)
                    return findSiblingPath.call(self, dep);
                else
                    return self.amdMaps[dep.name] || dep.name;

            });

        return generate(
            parse(
                amdWrap(
                    self.code,
                    deps
                )
            )
        );

    }

    /**
     * Return code of this factory wrapped as a cjs module, with dependencies
     * mapped and resolved according to annotations.
     */
    Factory.prototype.cjsify = function() {

        var self = this,
            deps = self.deps.map(function(dep) {

                if (dep.candidatePaths.length > 0)
                    return findSiblingPath.call(self, dep);
                else
                    return self.cjsMaps[dep.name] || dep.name;

            });

        return generate(
            parse(
                cjsWrap(
                    self.code,
                    deps
                )
            )
        );

    }

    /**
     * Wrap a factory with an AMD loader.
     */
    function amdWrap(factoryCode, deps) {
        var deps = deps.map(function(dep) {
            return "'" + dep + "'";
        });
        return AMD_TEMPLATE.START +
            deps.join(',') +
            AMD_TEMPLATE.MIDDLE +
            factoryCode +
            AMD_TEMPLATE.END;
    }

    /**
     * Wrap a factory with a CJS loader.
     */
    function cjsWrap(factoryCode, deps) {
        var requires = deps.map(function(dep) {
            return "require('" + dep + "')";
        });
        return CJS_TEMPLATE.START +
            factoryCode +
            CJS_TEMPLATE.MIDDLE +
            requires.join(',') +
            CJS_TEMPLATE.END;
    }

    function findSiblingPath(dep) {
        var self = this;

        // consult the 'preferMaps' mapping. If there's no entry there, 
        // match based only on the name, If more than one match, throw an error.

        var errs = {
                ambiguity: "Dependency ambiguity. " +
                    "More than one candidate for '" + dep.name + "'",
                notFound: "No candidate found for '" +
                    self.preferMaps[dep.name] + "'"
            },
            chosen;

        if (self.preferMaps[dep.name]) {

            var matches = dep.candidatePaths.filter(function(candidatePath) {
                return path.join(path.dirname(candidatePath), dep.name)
                    .indexOf(self.preferMaps[dep.name]) !== -1;
            });

            if (matches.length < 1) throw Error(errs.notFound);
            if (matches.length > 1) throw Error(errs.ambiguity);

            chosen = matches[0];

        } else if (dep.candidatePaths.length === 1) {

            chosen = dep.candidatePaths[0];

        } else throw Error(errs.ambiguity);

        var res = path.relative(self.dir, chosen);
        res = path.join(
            path.dirname(res),
            path.basename(
                res,
                path.extname(res)
            )
        );

        if (!(res.indexOf('.') === 0 || res.indexOf('/') === 0))
            res = './' + res;

        return res;

    }

    module.exports = Fume;

})(void 0);
