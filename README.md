# Fume

Use factories to fabricate AMD and CommonJS modules.

## Overview

Fume is a code generation tool which allows you to:

0. Define modules with factory functions.
0. Automatic dependencies detection based on your factory's arguments.
0. Manual dependencies mappings and annotations in your source code.

Write your code inside factory functions which receive dependencies as a list
of arguments. Fume will use your factories to generate AMD and CJS compatible
modules.

Fume will try to auto-magically detect inter-factory dependencies in your files.
You can also provide platform-based annotations in your source code.

## Installation & usage

Install with `npm install -g fume`

`require('fume')` for programmatic usage, or use the CLI tool:

```bash
fume [input(s)] -s [path] -s [path] ... --amdify --cjsify
    [input]: Input file path(s)
    -s (--sibling): Path of a sibling factory
    -a (--amdify): generate an AMD module
    -c (--cjsify): generate a CJS module
    -o (--out): output directory (optional if input is one file)
```

You can use the CLI in two modes:

0. **Single factory:**  
   Build an AMD or a CJS module from a single factory. You may pass in a list of
   sibling factories which will be analyzed for automatic dependency
   resolution. If no output directory is specified, the result will be written
   to the standard output.

0. **Multiple factories:**
   Pass multiple inputs to generate a module for each factory. Factories may be
   inter-dependent. You may pass in a list of sibling factories which will be
   analyzed for automatic dependency resolution. Results will be written to the
   specified output directory.

## Source annotations

Annotations are specified in a comment right before the factory function.

### Factory name

**Annotation:** `@name`

Sets the name of the factory. Will be used to resolve dependencies.

**Example:**

*foo.module.js*:

```Javascript
/* @name foo */
function factory(bar){ /* ... */ }
```

*bar.module.js*:

```Javascript
/* @name bar */
function factory(){ /* ... */ }
```

Generated AMD module for `foo`:

```Javascript
define(['./bar.module'], function factory(bar) {
    /* ... */
});
```

### Specify dependency preference

**Annotation:** `@prefer`

Specify which dependency to use in case of ambiguity.

**Example:**

*foo.js*:

```Javascript
/**
 * @name foo
 * @prefer bar bar-2.0
 */
function factory(bar){ /* ... */ }
```

*bar-1.0/bar.js*:

```Javascript
/* @name bar */
function factory(){ /* ... */ }
```

*bar-2.0/bar.js*:

```Javascript
/* @name bar */
function factory(){ /* ... */ }
```

**Note** that both `bar-1.0/bar` and `bar-2.0/bar` are annotated with the name
`bar`.

Generated AMD module for `foo`:

```Javascript
define(['./bar-1.0/bar'], function factory(bar) {
    /* ... */
});
```

## Example

Let's say we are developing a library `foo`. This library has two dependencies:

0. `bar` - a sub module we write as part of our library.
0. [`lodash`](https://github.com/lodash/lodash/)

We want to distribute our library both as an AMD module and as a CommonJS
module.

`lodash` has different distributions for AMD and CJS. As an AMD module we need
to depend on [`lodash-amd`](https://github.com/lodash/lodash-amd) ('modern'
flavor), and as a CJS module we want to depend on
[`lodash-node`](https://github.com/lodash/lodash-node).

When writing our module, we shouldn't care about where to retrieve the
dependency from. We just want to declare what we need:
`function factory(lodash, bar){ /* ... */ }`

When distributing our module the dependencies should be mapped to the correct
location. `lodash` should be mapped to either `lodash-amd` or `lodash-node`,
and `bar` should be mapped to `./bar`.

We annotate our code as follows:

**foo.js**

```Javascript
/**
 * @name foo
 * @amd lodash ../../lodash-amd/modern
 * @cjs lodash lodash-node
 */
function factory(lodash, bar){
    return function(){
        // use lodash...
        // use foo...
    }
}
```
 
The output of `fume foo.js -d bar.js --amdify` will be:

 ```Javascript
 define([
    '../../lodash-amd/modern',
    './bar'
], function factory(lodash, bar) {
    return function () {
    };
});
 ```

The output of `fume foo.js -d bar.js --cjsify` will be:

 ```Javascript
module.exports = function factory(lodash, bar) {
    return function () {
    };
}(require('lodash-node'), require('./bar'));
 ```
