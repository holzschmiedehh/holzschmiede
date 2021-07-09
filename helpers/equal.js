module.exports = function(lvalue, rvalue, options) {
    if (lvalue == rvalue) {
        return options.fn(this);
    } else {
        // we don't allow for an else block ;P
        return null
    }
}