/**
 * @name foo
 * @prefer bar bar-v2
 */
function fooFactory(bar, baz) {
    return function() {
        console.log("Bar says:", bar.msg1, bar.msg2);
        console.log("Baz says:", baz());
    };
}
