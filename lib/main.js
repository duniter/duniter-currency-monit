"use strict";

const co = require('co');

const webserver = require(__dirname + '/webserver.js');
const timestampToDatetime = require(__dirname + '/timestampToDatetime.js');

/****************************
 * Main algorithm
 */
module.exports = (duniterServer, host, port, appParente, program) => co(function *() {
    
  // Confirm started
  console.log("module currency-monit started");
  
  // Specialized node's UI
  let httpServer = webserver(host, port, appParente, duniterServer);
  yield httpServer.openConnection();

})
  .catch((err) => console.error(err.stack || err));
  
