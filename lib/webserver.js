"use strict";

const fs = require('fs');
const util = require('util');
const Q = require('q');
const _ = require('underscore');
const co = require('co');
const http = require('http');
const morgan = require('morgan');
const express = require('express');
const routes = require('../routes');
const bodyParser = require('body-parser');

const tpl = require('./tplit.js');

module.exports = (host, port, duniterServer, sigValidity, msValidity, sigWindow, idtyWindow, sigQty, stepMax, cache) => {
  
  var app = express();
  
  // Redirect stdout to access.log
  const logFile = fs.createWriteStream('./access.log', { flags: 'a' });
  console.log = function () {
    logFile.write(util.format.apply(null, arguments) + '\n');
  }
  //console.error = console.log;
  
  app.use(morgan('\x1b[90m:remote-addr :remote-user [:date[clf]] :method :url HTTP/:http-version :status :res[content-length] - :response-time ms\x1b[0m', {
    stream: {
      write: function(message){
        message && console.log(message.replace(/\n$/,''));
      }
    }
  }));
  app.use(bodyParser.urlencoded({ extended: true }));
  
  app.engine('html', tpl )
  app.set('views', './views') // specify the views directory
  app.set('view engine', 'html') // register the template engine
  
  app.locals.duniterServer = duniterServer
  app.locals.sigValidity = sigValidity
  app.locals.msValidity = msValidity
  app.locals.sigWindow = sigWindow
  app.locals.idtyWindow = idtyWindow
  app.locals.sigQty = sigQty
  app.locals.stepMax = stepMax
  app.locals.cache = cache
  
  app.locals.HTML_HEAD = fs.readFileSync('./views/HEAD.html', 'utf-8')
  
  app.use( routes )
  
  // Lancer le serveur web
  let httpServer = http.createServer(app);
  httpServer.on('error', function(err) {
    httpServer.errorPropagates(err);
  });
  
  return {
    openConnection: () => co(function *() {
      try {
        yield Q.Promise((resolve, reject) => {
          // Weird the need of such a hack to catch an exception...
          httpServer.errorPropagates = function(err) {
            reject(err);
          };

          httpServer.listen(port, host, (err) => {
            if (err) return reject(err);
            resolve(httpServer);
          });
        });
        console.log('Server listening on http://' + host + ':' + port);
      } catch (e) {
        console.warn('Could NOT listen to http://' + host + ':' + port);
        console.warn(e);
      }
    }),
  };
};
