var fs = require('fs') // this engine requires the fs module
module.exports = function (filePath, options, callback) { // define the template engine
  fs.readFile(filePath, function (err, content) {
    if (err) return callback(err)
    let fn = new Function('o','with(o){ return `'+content.toString()+'`}')
    return callback( null, fn(options) )
  })
}