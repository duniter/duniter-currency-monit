"use strict";

const co = require('co');
const webserver = require(__dirname + '/webserver.js');
const duniter = require(__dirname + '/duniter.js');

/****************************
 * Main algorithm
 */
module.exports = (duniterServer, host, port, appParente) => co(function *() {
  
  // Get currency name and parameters
  const blockZero = yield duniterServer.dal.peerDAL.query('SELECT `currency`,`parameters` from block where `number`=0');
  const tabParameters = blockZero[0].parameters.split(":");
  const sigValidity = tabParameters[6];
  const msValidity = tabParameters[11];
  const sigWindow = tabParameters[5];
  const idtyWindow = tabParameters[8];
  const sigQty = tabParameters[7];
  const stepMax = tabParameters[12];
  console.log("module currency-monit started");
  
  // Define cache
  var cache = {
    lock : false,
    beginBlock: null,
    endBlock: null,
    step: null,
    stepUnit: null,
    stepTime: null,
    onlyDate: null,
    Yn: 0,
    destroyAmount: 0,
    pubkeys: new Array(),
    pub_index: new Array(),
    blockchain: new Array()
  };
  
  // Specialized node's UI
  let httpServer = webserver(host, port, appParente, duniterServer, sigValidity, msValidity, sigWindow, idtyWindow, sigQty, stepMax, cache);
  yield httpServer.openConnection();

})
  .catch((err) => console.error(err.stack || err));
  
