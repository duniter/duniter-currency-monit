"use strict";

const co = require('co');
//const sqlite3 = require('sqlite3').verbose();
const home = require('os').homedir();

const webserver = require(__dirname + '/webserver.js');
const duniter = require(__dirname + '/duniter.js');

/****************************
 * Main algorithm
 */
module.exports = (duniterServer, host, port, appParente, program) => co(function *() {
  
  // Define cache
  var cache = {
		// membersCount
		lockMembersCount: false,
    lastUptime: 0,
    beginBlock: null,
    currentBlockNumber : 0,
    currentBlockTime: 0,
    currentSentries: 0,
    endBlock: null,
    step: null,
    stepUnit: null,
    stepTime: null,
    onlyDate: null,
		Yn: 0,
		pubkeys: new Array(),
		pub_index: new Array(),
		blockchain: new Array()
  };
  
  // Create or open monit database
  const dbPath = duniterServer.home+'/currency-monit.db';
  /*var db = new sqlite3.Database(dbPath);
  db.serialize(function() {
    db.run("CREATE TABLE if not exists blocks (number TEXT, hash TEXT, medianTime TEXT, sentries INT)");
    db.run("CREATE TABLE if not exists pubkeys (pub TEXT, expires_on TEXT, writtenCerts TEXT, receivedCerts TEXT)");
    db.each("SELECT `number`,`hash`,`medianTime`,`sentries` FROM blocks ORDER BY medianTime ASC", function(err, row) {
        if (err != null) { console.log(err); }
        else
	{
	  let newSentries = row.sentries-cache.currentSentries;
	  if (newSentries != 0)
	  {
	    cache.blockchain.push({
	      number: row.number,
	      hash: row.hash,
	      medianTime: row.medianTime,
	      newSentries: newSentries,
	      sentries: row.sentries
	    });
	    cache.currentBlockNumber = row.number;
	    cache.currentBlockTime = row.medianTime;
	    cache.currentSentries = row.sentries;
	  }
	}
    });
    db.each("SELECT `pub`,`expires_on`,`writtenCerts`,`receivedCerts` FROM pubkeys", function(err, row) {
      if (err != null) { console.log(err); }
      else
      {
	cache.pubkeys.push({
	      updateWot: false,
	      expires_on: row.expires_on,
	      pub: row.pub,
	      writtenCerts: JSON.parse(row.writtenCerts),
	      receivedCerts: JSON.parse(row.receivedCerts)
	    });
      }
    });
  });
  db.close();*/
    
  // Confirm started
  console.log("module currency-monit started");
  
  // Specialized node's UI
  let httpServer = webserver(host, port, appParente, duniterServer, cache, dbPath);
  yield httpServer.openConnection();

})
  .catch((err) => console.error(err.stack || err));
  
