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

Fume will try to automagically detect inter-factory dependencies in your files.
You can also provide platform-based annotations in your source code.

## Installation & usage

Install with `npm install -g fume`

`fume` is now a cli command.

```bash
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
