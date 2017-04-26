"use strict";

const co = require('co');
const main = require('./lib/main.js');
const duniter = require('duniter');

/****************************************
 * TECHNICAL CONFIGURATION
 ***************************************/

// Default Duniter node's database
const DEFAULT_DUNITER_DATA_FOLDER = 'currency-monit-dev';

// host on which UI is available
const DEFAULT_HOST = 'localhost';

// port on which UI is available
const DEFAULT_PORT = 10500;

/****************************************
 * SPECIALIZATION
 ***************************************/

const stack = duniter.statics.autoStack([{
  name: 'currency-monit',
  required: {

    duniter: {

      cli: [{
        name: 'currency-monit [host] [port] [data-folder]',
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
    }
  }
}]);

co(function*() {
  if (!process.argv.includes('--mdb')) {
    // We use the default database
    process.argv.push('--mdb');
    process.argv.push(DEFAULT_DUNITER_DATA_FOLDER);
  }
  // Execute our program
  yield stack.executeStack(process.argv);
  // End
  process.exit();
});
