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

    function Fume(sources, config) {

        config = config || {};
        config.nameTagPrefix = config.nameTagPrefix || NAME_TAG_PREFIX;
        config.amdTagPrefix = config.amdTagPrefix || AMD_TAG_PREFIX;
        config.cjsTagPrefix = config.cjsTagPrefix || CJS_TAG_PREFIX;

        var nameTagRe = new RegExp(
                "^.*?" +
                config.nameTagPrefix +
                "\\s*(\\w+)\\W*$"
            ),
            amdTagRe = new RegExp(
                "^.*?" +
                config.amdTagPrefix +
                "\\s*(\\S+)\\s+(\\S+)\\W*$"
            ),
            cjsTagRe = new RegExp(
                "^.*?" +
                config.cjsTagPrefix +
                "\\s*(\\S+)\\s+(\\S+)\\W*$"
            );

        // parse the sources and get needed information
        sources = sources.map(function(source) {

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
                        return source !== other && other.name === source.name;
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

            return source;

        });

        // create AMD & CJS modules from each of the sourcrs
        sources = sources.map(function(source) {

            // each of the factory's arguments needs to have a corresponding
            // 'require' (cjs) / dependency name (amd)

            var requires = source.factory.params.map(function(param) {

                var name = source.cjsMaps[param.name] || param.name;

                if (param.name === source.name)
                    throw Error(
                        "A factory cannot define itself as a dependency (" +
                        source.name +
                        ")"
                    );

                // this dependency is a sibling if one of the sources has a
                // matching name
                var sibling = sources.some(function(other) {
                    return other.name === param.name;
                });

                return "require('" + (sibling ? "./" : "") + param.name + "')";

            });

            var deps = source.factory.params.map(function(param) {

                var name = source.amdMaps[param.name] || param.name;

                if (param.name === source.name)
                    throw Error(
                        "A factory cannot define itself as a dependency (" +
                        source.name +
                        ")"
                    );

                // this dependency is a sibling if one of the sources has a
                // matching name
                var sibling = sources.some(function(other) {
                    return other.name === param.name;
                });

                return "'" + (sibling ? "./" : "") + param.name + "'";

            });

            var cjs = CJS_TEMPLATE.START +
                source.code +
                CJS_TEMPLATE.MIDDLE +
                requires.join(',') +
                CJS_TEMPLATE.END;

            var amd = AMD_TEMPLATE.START +
                deps.join(',') +
                AMD_TEMPLATE.MIDDLE +
                source.code +
                AMD_TEMPLATE.END;

            return {
                code: {
                    cjs: generate(parse(cjs)),
                    amd: generate(parse(amd))
                },
                path: source.path
            };

        });

        return sources;

    }

    module.exports = Fume;

})(void 0);
