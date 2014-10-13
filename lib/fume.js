(function(undefined) {

    var parse = require('esprima').parse,
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
    var NAME_TAG_PREFIX = "@name:",
        AMD_TAG_PREFIX = "@amd:",
        CJS_TAG_PREFIX = "@cjs:";

    // get pre-factory comment regex:
    var cmtLinesRe = new RegExp("^([\\s\\S]*?)\\s*function", "m");

    /**
     * Parse the list of sources
     */
    function Fume(sources, config) {

        config = config || {};
        config.nameTagPrefix = config.nameTagPrefix || NAME_TAG_PREFIX;
        config.amdTagPrefix = config.amdTagPrefix || AMD_TAG_PREFIX;
        config.cjsTagPrefix = config.cjsTagPrefix || CJS_TAG_PREFIX;
        this.config = config;

        var nameTagRe = new RegExp(
                "^.*?" +
                this.config.nameTagPrefix +
                "\\s*(\\w+)\\W*$"
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

            source.tree = parse(source.code);
            source.factory = source.tree.body[0];
            source.amdMaps = {};
            source.cjsMaps = {};

            if (source.factory.type !== 'FunctionDeclaration')
                throw Error("Expected a factory function at " + source.path);

            source.args = source.factory.params;

            // get comment lines before the factory function:
            var m = source.code.match(cmtLinesRe);
            // this RegExp should always match
            if (!m) throw Error("Unable to parse pre-factory directives");
            var cLines = m[1].split(/[\n\r]/);

            // extract directives from the comment lines:
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
                        return other !== source && other.name === source.name;
                    }))
                    throw Error(
                        "Factory name '" +
                        source.name +
                        "' cannot be specified more than once"
                    );

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

                // this dependency is a sibling if one of the other sources has
                // a matching name
                param.sibling = sources.some(function(other) {
                    return other !== source && other.name === param.name;
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
        this.code = source.code;
        this.deps = source.factory.params;
        this.cjsMaps = source.cjsMaps;
        this.amdMaps = source.amdMaps;
    }

    /**
     * Return code of this factory wrapped as an amd module, with dependencies
     * mapped and resolved according to annotations.
     */
    Factory.prototype.amdify = function() {

        var self = this,
            deps = self.deps.map(function(dep) {

                var name = self.amdMaps[dep.name] || dep.name;

                if (name === self.name)
                    throw Error(
                        "A factory cannot define itself as a dependency (" +
                        self.name +
                        ")"
                    );

                return "'" + (dep.sibling ? "./" : "") + dep.name + "'";

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

                var name = self.cjsMaps[dep.name] || dep.name;

                if (name === self.name)
                    throw Error(
                        "A factory cannot define itself as a dependency (" +
                        self.name +
                        ")"
                    );

                return (self.sibling ? "./" : "") + dep.name;

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

    module.exports = Fume;

})(void 0);
