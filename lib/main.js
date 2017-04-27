"use strict";

const co = require('co');
const webserver = require('./webserver.js');
const duniter = require('./duniter.js');

/****************************
 * Main algorithm
 */
module.exports = (duniterServer, host, port) => co(function *() {

  // Get currency parameters
  const parameters = yield duniterServer.dal.peerDAL.query('SELECT `parameters` from block where `number`=0');
  const tabParameters = parameters[0].parameters.split(":");
  const msValidity = tabParameters[11];
  const sigValidity = tabParameters[6];
  const sigWindow = tabParameters[5];
  const idtyWindow = tabParameters[8];
  const  sigQty = tabParameters[7];
  console.log("msValidity = %s", msValidity);
  console.log("sigValidity = %s", sigValidity);
  console.log("sigWindow = %s", sigWindow);
  console.log("idtyWindow = %s", idtyWindow);
  
  // Specialized node's UI
  let httpServer = webserver(host, port, duniterServer, sigValidity, msValidity, sigWindow, idtyWindow, sigQty);
  yield httpServer.openConnection();

})
  .catch((err) => console.error(err.stack || err));
  
