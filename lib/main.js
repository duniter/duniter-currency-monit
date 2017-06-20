"use strict";

const co = require('co');
const sqlite3 = require('sqlite3').verbose();
const home = require('os').homedir();

const webserver = require(__dirname + '/webserver.js');
const duniter = require(__dirname + '/duniter.js');

/****************************
 * Main algorithm
 */
module.exports = (duniterServer, host, port, appParente, program) => co(function *() {
  
  // Create monit database
  const dbPath = duniterServer.home+'/currency-monit.db';
  var db = new sqlite3.Database(dbPath);
  db.serialize(function() {
    db.run("CREATE TABLE if not exists blocks (number TEXT, timestamp TEXT, sentries INT)");
  });
  db.close();
  
  // Define cache
  var cache = {
    lock : false,
    beginBlock: null,
    currentBlockNumber : 0,
    currentBlockTime: 0,
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
    
  // Confirm started
  console.log("module currency-monit started");
  
  // Specialized node's UI
  let httpServer = webserver(host, port, appParente, duniterServer, cache, dbPath);
  yield httpServer.openConnection();

})
  .catch((err) => console.error(err.stack || err));
  
