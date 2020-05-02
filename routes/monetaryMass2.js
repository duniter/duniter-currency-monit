"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const DataFinder_1 = require("../lib/DataFinder");
const constants2_1 = require("../lib/constants2");
const co = require('co');
const timestampToDatetime = require(__dirname + '/../lib/timestampToDatetime');
const getLang = require(__dirname + '/../lib/getLang');
module.exports = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var { duniterServer } = req.app.locals;
    const dataFinder = yield DataFinder_1.DataFinder.getInstanceReindexedIfNecessary();
    try {
        // get GET parameters
        var begin = req.query.begin >= 2 && req.query.begin || 2; // Default Value
        var end = req.query.end || -1; // Default Value is current timestamp
        var unit = req.query.unit || 'relative';
        var format = req.query.format || 'HTML';
        // get lg file
        const LANG = getLang(`${__dirname}/../lg/monetaryMass_${req.query.lg || constants2_1.MonitConstants.DEFAULT_LANGUAGE}.txt`);
        // calculate meanMonetaryMassAtFullCurrency
        const meanMonetaryMassAtFullCurrency = Math.ceil((1 / duniterServer.conf.c) * (duniterServer.conf.dtReeval / duniterServer.conf.dt));
        // get beginBlock and endBlock
        var beginBlock = [yield dataFinder.getBlock(begin)];
        var endBlock = null;
        if (end > 0) {
            endBlock = [yield dataFinder.getBlock(end)];
            if (typeof (endBlock[0]) == 'undefined') {
                endBlock = [yield dataFinder.getCurrentBlockOrNull()];
                end = endBlock[0].number;
            }
        }
        else {
            endBlock = [yield dataFinder.getCurrentBlockOrNull()];
        }
        // get blockchain
        if (end >= begin && begin >= 1) {
            var blockchain = yield dataFinder.getBlockWhereMedianTimeLteAndGteNoLimit(endBlock[0].medianTime, beginBlock[0].medianTime);
        }
        else {
            var blockchain = yield dataFinder.getBlockWhereMedianTimeGtNoLimit(beginBlock[0].medianTime);
        }
        // get blockchain timestamp
        const currentBlockNumber = begin + blockchain.length - 1;
        const currentBlockchainTimestamp = blockchain[blockchain.length - 1].medianTime;
        if (end == -1) {
            end = begin + blockchain.length - 1;
        }
        // create and fill tabMembersCount, tabMonetaryMass, tabCurrency and currentDividend
        var tabCurrency = [];
        var currentDividend = 0;
        let previousMonetaryMass = 0;
        for (let b = 0; b < blockchain.length; b++) {
            if (blockchain[b].monetaryMass != previousMonetaryMass) {
                tabCurrency.push({
                    blockNumber: blockchain[b].number,
                    timestamp: blockchain[b].medianTime,
                    dateTime: timestampToDatetime(blockchain[b].medianTime, true),
                    membersCount: blockchain[b].membersCount,
                    monetaryMass: blockchain[b].monetaryMass / 100,
                    monetaryMassPerMembers: parseFloat(((blockchain[b].monetaryMass / 100) / blockchain[b].membersCount).toFixed(2)),
                    derivedChoiceMonetaryMass: 0
                });
                if (blockchain[b].dividend > 0) {
                    currentDividend = blockchain[b].dividend;
                }
                previousMonetaryMass = blockchain[b].monetaryMass;
            }
        }
        // calculate choiceMonetaryMass and derivedChoiceMonetaryMass
        for (let i = 0; i < tabCurrency.length; i++) {
            if (unit == "relative") {
                tabCurrency[i].monetaryMass = parseFloat(((tabCurrency[i].monetaryMass / currentDividend) * 100).toFixed(2));
                tabCurrency[i].monetaryMassPerMembers = parseFloat(((tabCurrency[i].monetaryMassPerMembers / currentDividend) * 100).toFixed(2));
            }
            else if (unit == "percentOfFullCurrency") {
                tabCurrency[i].monetaryMass = parseFloat((((tabCurrency[i].monetaryMassPerMembers / currentDividend) / meanMonetaryMassAtFullCurrency) * 10000).toFixed(2));
                tabCurrency[i].monetaryMassPerMembers = tabCurrency[i].monetaryMass;
            }
            if (i > 0) {
                tabCurrency[i].derivedChoiceMonetaryMass = Math.abs(parseFloat((((tabCurrency[i].monetaryMass / tabCurrency[i - 1].monetaryMass) - 1.0) * 100).toFixed(2)));
            }
        }
        // Si le client demande la réponse au format JSON, le faire
        if (format == 'JSON')
            res.status(200).jsonp(tabCurrency);
        else {
            // GET parameters
            var massByMembers = req.query.massByMembers == 'no' && unit != "percentOfFullCurrency" ? 'no' : 'yes';
            var type = req.query.type || 'logarithmic';
            if (unit == "percentOfFullCurrency") {
                type = 'linear';
            }
            if (type != 'linear') {
                type = 'logarithmic';
            }
            // Define full currency description
            var fullCurrency = LANG['DESC1'] + " <b>" + meanMonetaryMassAtFullCurrency
                + " " + LANG['UD'] + "</b> (" + LANG['FULL_CURRENCY_FORMULA'] + " = <b>" + meanMonetaryMassAtFullCurrency + " " + LANG['UD'] + "</b>)<br>"
                + LANG['CURRENTLY'] + ", 1 " + LANG['UD'] + "<sub>" + duniterServer.conf.currency + "</sub> = <b>" + (currentDividend / 100) + "</b> " + duniterServer.conf.currency + " " + LANG['AND_WE_HAVE'] + " <b>"
                + endBlock[0].membersCount + "</b> " + LANG['DESC2'] + " <b>"
                + (meanMonetaryMassAtFullCurrency * currentDividend * endBlock[0].membersCount / 100) + "</b> " + duniterServer.conf.currency
                + " (<b>" + (meanMonetaryMassAtFullCurrency * currentDividend / 100) + "</b> " + duniterServer.conf.currency + "/" + LANG['MEMBER'] + ").";
            // Define max yAxes
            var maxYAxes = meanMonetaryMassAtFullCurrency;
            let indexEnd = tabCurrency.length - 1;
            if (unit == "quantitative") {
                maxYAxes = maxYAxes * currentDividend / 100;
            }
            if (unit == "percentOfFullCurrency") {
                maxYAxes = 100;
            }
            else if (massByMembers == "no") {
                maxYAxes = maxYAxes * endBlock[0].membersCount;
            }
            res.locals = {
                host: req.headers.host.toString(),
                tabCurrency,
                currentDividend,
                begin,
                end,
                unit,
                massByMembers,
                type,
                form: `${LANG['BEGIN']} #<input type="number" name="begin" value="${begin}"> - ${LANG['END']} #<input type="number" name="end" value="${end}"> <select name="unit">
            <option name="unit" value ="quantitative">${LANG['QUANTITATIVE']}
            <option name="unit" value ="relative" ${unit == 'relative' ? 'selected' : ''}>${LANG['RELATIVE']}
            <option name="unit" value ="percentOfFullCurrency" ${unit == 'percentOfFullCurrency' ? 'selected' : ''}>${LANG['PERCENT_OF_FULL_CURRENCY']}
          </select> <select name="massByMembers">
            <option name="massByMembers" value ="yes">${LANG['MASS_BY_MEMBERS']}
            <option name="massByMembers" value ="no" ${massByMembers == 'no' ? 'selected' : ''}>${LANG['TOTAL_MASS']}
          </select> <select name="type">
            <option name="type" value ="logarithmic">${LANG['LOGARITHMIC']}
            <option name="type" value ="linear" ${type == 'linear' ? 'selected' : ''}>${LANG['LINEAR']}
          </select>`,
                description: `${fullCurrency}`,
                chart: {
                    type: 'bar',
                    data: {
                        labels: tabCurrency.map(item => item.dateTime),
                        //yLabels: tabCurrency.map( item=> item.monetaryMass, item=>derivedChoiceMonetaryMass),
                        datasets: [{
                                //yAxisID: 1,
                                label: `${unit == "percentOfFullCurrency" ? `${LANG['MONETARY_MASS']} (${LANG['IN_PERCENT_OF_FULL_CURRENCY']})` : `#${unit == "relative" ? LANG['UD'] + "ğ1" : 'Ğ1'}${massByMembers == "yes" ? '/' + LANG['MEMBER'] : ''}`}`,
                                data: tabCurrency.map(item => massByMembers == "no"
                                    ? item.monetaryMass
                                    : item.monetaryMassPerMembers),
                                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                                borderColor: 'rgba(54, 162, 235, 1)',
                                borderWidth: 1
                            },
                            {
                                //yAxisID: 2,
                                label: LANG['PERCENT_VARIATION_MONETARY_MASS'],
                                data: tabCurrency.map(item => item.derivedChoiceMonetaryMass),
                                backgroundColor: 'rgba(0, 162, 0, 0.5)',
                                borderColor: 'rgba(0, 162, 0, 1)',
                                borderWidth: 1,
                                type: 'line',
                                fill: false
                            }]
                    },
                    options: {
                        // plugins: {
                        //   afterDraw: function (chart, easing) {
                        //     var self = chart.config;    /* Configuration object containing type, data, options */
                        //     var ctx = chart.chart.ctx;  /* Canvas context used to draw with */
                        //   }
                        // },
                        title: {
                            display: true,
                            text: `${unit == "percentOfFullCurrency" ? LANG['MONETARY_MASS'] + ' ' + LANG['IN_PERCENT_OF_FULL_CURRENCY'] : `${unit == "relative" ? LANG['UD'] + "ğ1 " : 'Ğ1 '} ${massByMembers == "yes" ? LANG['BY_MEMBER'] : ''}`} ${LANG['IN_THE_RANGE']} #${begin}-#${end}`
                        },
                        legend: {
                            display: true
                        },
                        scales: {
                            yAxes: [{
                                    //yAxisID: 1,
                                    type: type,
                                    position: 'left',
                                    ticks: {
                                        callback: function (value, index, values) {
                                            return Number(value.toString()); //pass tick values as a string into Number function
                                        },
                                        max: maxYAxes,
                                    }
                                } /*,
                                {
                                  //yAxisID: 2,
                                      type: type,
                                  position: 'right',
                                  ticks: {
                                      callback: function(value, index, values) {//needed to change the scientific notation results from using logarithmic scale
                                              return Number(value.toString()); //pass tick values as a string into Number function
                                      }
                                  }
                                }*/
                            ]
                        }
                    }
                }
            };
            next();
        }
    }
    catch (e) {
        // En cas d'exception, afficher le message
        res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
    }
});
//# sourceMappingURL=monetaryMass2.js.map