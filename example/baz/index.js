/**
 * @name baz
 * @prefer bar bar-v1
 */
function bazFactory(bar) {
    return function() {
        return bar.msg1 + " " + bar.msg2;
    };
}
