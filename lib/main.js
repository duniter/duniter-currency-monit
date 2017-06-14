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
  
  /*// Create monit database
  const configPath = home+'/.config/duniter/'+program.mdb+'/';
   var db = new sqlite3.Database(configPath + 'currency-monit.db');
  
  // Fill monit database
  db.serialize(function() {
    db.run("CREATE TABLE lorem (info TEXT)");
  
    var stmt = db.prepare("INSERT INTO lorem VALUES (?)");
    for (var i = 0; i < 10; i++) {
	stmt.run("Ipsum " + i);
    }
    stmt.finalize();
  
    db.each("SELECT rowid AS id, info FROM lorem", function(err, row) {
	console.log(row.id + ": " + row.info);
    });
  });
  db.close();
  
  // Read monit database
  const db2 = new sqlite3.Database(configPath + 'currency-monit.db');
  db2.serialize(function() {
    db2.all("SELECT * FROM user_info", function(err, rows) {
      if (err) { console.error(err); }
      else { for (let i=0;i<rows.length;i++) { console.log("%s:%s", rows[i].id, rows[i].info); } }
    });
  });
  db2.close();*/
  
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
    
  // Confirm started
  console.log("module currency-monit started");
  
  // Specialized node's UI
  let httpServer = webserver(host, port, appParente, duniterServer, cache);
  yield httpServer.openConnection();

})
  .catch((err) => console.error(err.stack || err));
  
