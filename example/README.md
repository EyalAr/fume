# Fume module building example

This directory contains several factories with inter-dependencies. We want to
generate an AMD or a CJS module from those factories.

Type this in your shell:

`fume {,**/}*.js -c -o dist`

This will generate a CJS module from your factories and store them in the `dist`
directory. To generate AMD module replace `-c` with `-a`.

**Note**: `{,**/}*.js` recursively expands to all `.js` files in the current
directory. Your shell may have a different syntax.

## Overview

In this example we have three sub-modules:

0. foo
0. bar
0. baz

- `bar` has two versions.
- `foo` depends on `bar` (version 2) and `baz`.
- `baz` depends on `bar` (version 1).

Notice how we use annotations to tell Fume how to resolve dependencies.
Without the `@prefer` annotation, we would have ambiguity between version 1 and
version 2 of `bar`.
