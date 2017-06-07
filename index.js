"use strict";

const co = require('co');
const fs = require('fs')
const path = require('path')
const main = require(__dirname + '/lib/main.js');
//const duniter = require('duniter');

/****************************************
 * TECHNICAL CONFIGURATION
 ***************************************/

// Default Duniter node's database
//const DEFAULT_DUNITER_DATA_FOLDER = 'currency-monit-dev';

// host on which UI is available
const DEFAULT_HOST = 'localhost';

// port on which UI is available
const DEFAULT_PORT = 10500;

/****************************************
 * SPECIALIZATION
 ***************************************/

/*const stack = duniter.statics.autoStack([{
  name: 'currency-monit',
  required: {*/
module.exports = {
    duniter: {

      cli: [{
        name: 'currency-monit [host] [port]',
        desc: 'Starts specialized node currency-monit',

        // Disables Duniter node's logs
        logs: false,

        onDatabaseExecute: (server, conf, program, params, startServices) => co(function*() {
	  
	  // currency-monit parameters
          const SERVER_HOST = params[0] || DEFAULT_HOST;
          const SERVER_PORT = parseInt(params[1]) || DEFAULT_PORT;

          // IMPORTANT: release Duniter services from "sleep" mode
          yield startServices();

          // Main Loop
          yield main(server, SERVER_HOST, SERVER_PORT);

          // Wait forever, this is a permanent program
          yield new Promise(() => null);
        })
      }]
    },
    duniterUI: {
      inject: {
	menu: fs.readFileSync(path.join(__dirname, 'injection/menu.js'), 'utf8')
      },
      route: (app, server, conf, program, params) => {
	// currency-monit parameters
        const SERVER_HOST = params[0] || DEFAULT_HOST;
        const SERVER_PORT = parseInt(params[1]) || DEFAULT_PORT;

        // Main Loop
        main(server, SERVER_HOST, SERVER_PORT);

        // Wait forever, this is a permanent program
        new Promise(() => null);
      }
    }
  }
//}]);

/*co(function*() {
  if (!process.argv.includes('--mdb')) {
    // We use the default database
    process.argv.push('--mdb');
    process.argv.push(DEFAULT_DUNITER_DATA_FOLDER);
  }
  // Execute our program
  yield stack.executeStack(process.argv);
  // End
  process.exit();
});*/
