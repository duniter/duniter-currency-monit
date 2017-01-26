"use strict";

const co = require('co');
const duniter = require('duniter');

module.exports = (dataFolder, httpLogs) => co(function *() {

  let server = duniter({ name: dataFolder }); // Node configuration is inside the home folder

  // Conf
  yield server.plugFileSystem();
  yield server.loadConf();

  // Services
  yield server.initDAL();

  let current = yield server.BlockchainService.current();

  if (!current) {
    throw 'Your node has not been initialized with a currency. Please run `sync <server> <port>` command before running this program.';
  }
  yield server.checkConfig();
  yield server.listenToTheWeb(httpLogs);

  // Routing documents
  server.routing();

  if (server.conf.upnp) {
    yield server.upnp();
    server.upnpAPI.startRegular();
  }

  yield server.start();

  return server;
});
