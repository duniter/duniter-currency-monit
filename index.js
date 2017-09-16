"use strict";

const co = require('co');
const fs = require('fs');
const path = require('path');
const main = require(__dirname + '/lib/main.js');
const indexing = require(__dirname + '/lib/indexing.js');

/****************************************
 * TECHNICAL CONFIGURATION
 ***************************************/

// Default Duniter node's database
//const DEFAULT_DUNITER_DATA_FOLDER = 'currency-monit-dev';


// host on which UI is available
const DEFAULT_ACTION = 'start';

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

      config: {
        onLoading: (conf, program) => co(function*() {

          // Define duniter-currency-monit parameters namespace
          const obj = conf['duniter-currency-monit'] = conf['duniter-currency-monit'] || {}
        })
      },

      cliOptions: [
        //{ value: '--option-name <value_type>', desc: 'description for help command'}
      ],

      cli: [{
        name: 'currency-monit [action=start] [host] [port]',
        desc: 'Action start : Start duniter with module currency-monit\n'
        +'Action indexing : indexing blockchain',

        // Disables Duniter node's logs
        logs: false,

        onDatabaseExecute: (server, conf, program, params, startServices) => co(function*() {
	  
          // currency-monit parameters
          const ACTION = params[0] || DEFAULT_ACTION;
          const SERVER_HOST = params[1] || DEFAULT_HOST;
          const SERVER_PORT = parseInt(params[2]) || DEFAULT_PORT;

          if (ACTION == "start")
          {
            // IMPORTANT: release Duniter services from "sleep" mode
            yield startServices();

            // Main Loop
            yield main(server, SERVER_HOST, SERVER_PORT, null, program);

            // Wait forever, this is a permanent program
            yield new Promise(() => null);
          }
          else if (ACTION == "indexing")
          {
            try {
              indexing(server, conf, program, params);
            } catch (err) {
              console.error('Error during blockchain indexing ', err);
            }
            // Close the DB connection properly
            return server && server.disconnect()
          }
          else
          {
            console.error('Error unknow action "%s" !', ACTION);
            // Close the DB connection properly
            return server && server.disconnect()
          }
        })
      }]
    },
    duniterUI: {
      inject: {
	menu: fs.readFileSync(path.join(__dirname, 'injection/menu.js'), 'utf8')
      },
      
      route: (app, server, conf, program, params) => {
        // Main Loop
        //main(server, SERVER_HOST, SERVER_PORT);
	main(server, null, null, app, program);  // `app` est un serveur HTTP Express

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
