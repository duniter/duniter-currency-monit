module.exports = function randomInt (low, high) {
    return Math.floor(Math.random() * (high - low) + low);
}
