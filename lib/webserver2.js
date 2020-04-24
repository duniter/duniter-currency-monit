"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DataFinder_1 = require("./DataFinder");
const fs = require('fs');
//const util = require('util');
const Q = require('q');
//const _ = require('underscore');
const co = require('co');
const http = require('http');
const morgan = require('morgan');
const express = require('express');
const bodyParser = require('body-parser');
const routes = require(__dirname + '/../routes');
const tpl = require(__dirname + '/tplit.js');
module.exports = (host, port, appParente, duniterServer, monitDatasPath, offset, cache, resetData) => {
    var app = express();
    app.use(morgan('\x1b[90m:remote-addr :remote-user [:date[clf]] :method :url HTTP/:http-version :status :res[content-length] - :response-time ms\x1b[0m', {
        stream: {
            write: function (message) {
                message && console.log(message.replace(/\n$/, ''));
            }
        }
    }));
    app.use(bodyParser.urlencoded({ extended: true }));
    app.engine('html', tpl);
    app.set('views', __dirname + '/../views'); // specify the views directory
    app.set('view engine', 'html'); // register the template engine
    app.locals.duniterServer = duniterServer;
    app.locals.monitDatasPath = monitDatasPath;
    app.locals.currencyName = duniterServer.conf.currency;
    app.locals.offset = offset;
    app.locals.cache = cache;
    app.locals.HTML_HEAD = fs.readFileSync(__dirname + '/../views/HEAD.html', 'utf-8');
    app.locals.HTML_TOR_HEAD = fs.readFileSync(__dirname + '/../views/TOR_HEAD.html', 'utf-8');
    app.use(routes);
    /***************************************
    * CSV des membres calculants
    ***************************************/
    app.get('/csvCalculatorsRank', function (req, res) {
        let files = fs.readdirSync(monitDatasPath + '/calculators_rank/');
        let maxTimestamp = 0;
        for (let file of files) {
            let fileTimestamp = parseInt(file.split('_')[2]);
            if (fileTimestamp > maxTimestamp) {
                maxTimestamp = fileTimestamp;
            }
        }
        var file = monitDatasPath + '/calculators_rank/calculators_rank_' + maxTimestamp + '.csv';
        res.download(file); // Set disposition and send it.
    });
    // Si l'on ne dispose pas d'un serveur web parent, lancer notre propre serveur web
    if (appParente == null) {
        let httpServer = http.createServer(app);
        httpServer.on('error', function (err) {
            httpServer.errorPropagates(err);
        });
        return {
            openConnection: async () => {
                try {
                    await Q.Promise((resolve, reject) => {
                        // Weird the need of such a hack to catch an exception...
                        httpServer.errorPropagates = function (err) {
                            reject(err);
                        };
                        httpServer.listen(port, host, (err) => {
                            if (err)
                                return reject(err);
                            resolve(httpServer);
                        });
                    });
                    // Init + first incremental indexation
                    await DataFinder_1.initMonitDB(duniterServer, resetData);
                    console.log('Server listening on http://' + host + ':' + port);
                }
                catch (e) {
                    console.warn('Could NOT listen to http://' + host + ':' + port);
                    console.warn(e);
                }
            },
        };
    }
    else {
        appParente.use("/currency-monit", app);
        return {
            openConnection: async () => {
                console.log('No connection to open');
            }
        };
    }
};
//# sourceMappingURL=webserver2.js.map