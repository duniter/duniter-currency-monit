"use strict";

const co = require('co');
const main = require('./lib/main.js');
const duniter = require('duniter');

/****************************************
 * TECHNICAL CONFIGURATION
 ***************************************/

// Default Duniter node's database
const HOME_DUNITER_DATA_FOLDER = 'currency-monit-clean-dev';

// host on which UI is available
const SERVER_HOST = 'localhost';

// port on which UI is available
const SERVER_PORT = 10503;

/****************************************
 * SPECIALIZATION
 ***************************************/

const stack = duniter.statics.autoStack([{
  name: 'currency-monit',
  required: {

    duniter: {

      cli: [{
        name: 'currency-monit [host] [port]',
        desc: 'Starts specialized node currency-monit',

        // Disables Duniter node's logs
        logs: false,

        onDatabaseExecute: (server, conf, program, params, startServices) => co(function*() {

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
    process.argv.push(HOME_DUNITER_DATA_FOLDER);
  }
  // Execute our program
  yield stack.executeStack(process.argv);
  // End
  process.exit();
});
