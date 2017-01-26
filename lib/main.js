"use strict";

const co = require('co');
const webserver = require('./webserver.js');
const duniter = require('./duniter.js');
//const wallet = require('./wallet.js');

/****************************
 * Main algorithm
 */
module.exports = (duniterServer, host, port) => co(function *() {

  // Get msValidity and sigValidity parameters
  const parameters = yield duniterServer.dal.peerDAL.query('SELECT `parameters` from block where `number`=0');
  const tabParameters = parameters[0].parameters.split(":");
  const msValidity = tabParameters[11];
  const sigValidity = tabParameters[6];
  console.log("msValidity = %s", msValidity);
  console.log("sigValidity = %s", sigValidity);
  
  // Specialize node UI
  let httpServer = webserver(host, port, duniterServer, sigValidity, msValidity);
  yield httpServer.openConnection();

  // Wallet usage
  //let remuWallet = wallet(duniterServer);

})
  .catch((err) => console.error(err.stack || err));
  
