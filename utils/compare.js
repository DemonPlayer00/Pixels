const sqlUBigInt_max = 18446744073709551615n;

function is_sqlUBigInt(num) {
    return typeof num === 'bigint' && num >= 0n && num <= sqlUBigInt_max;
}

module.exports = {
    is_sqlUBigInt: is_sqlUBigInt,
    sqlUBigInt_max: sqlUBigInt_max
};