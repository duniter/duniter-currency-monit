"use strict";

const co = require('co');
const os = require('os');
const fs = require('fs');

const webserver = require(__dirname + '/webserver2.js');
const timestampToDatetime = require(__dirname + '/timestampToDatetime.js');

/****************************
 * Main algorithm
 */
module.exports = (duniterServer, host, port, appParente, program) => co(function *() {

  // Get local timezone offset
  var x = new Date();
  var offset = -x.getTimezoneOffset();
  //timestampToDatetime(1000000, true, offset);

  // Get monitDatasPath
  const mdb = program.mdb || "duniter_default";
  const monitDatasPath = os.homedir() + "/.config/duniter/" + mdb + "/currency-monit/";

  // Create monitDatasPath
  if (!fs.existsSync(monitDatasPath)) { fs.mkdirSync(monitDatasPath) }
  
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
    
  // Confirm started
  console.log("module currency-monit started");
  
  // Specialized node's UI
  let httpServer = webserver(host, port, appParente, duniterServer, monitDatasPath, offset, cache, program.resetData);
  yield httpServer.openConnection();

})
  .catch((err) => console.error(err.stack || err));
  
