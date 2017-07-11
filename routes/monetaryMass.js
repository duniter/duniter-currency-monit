"use strict";

const co = require('co')
const timestampToDatetime = require(__dirname + '/../lib/timestampToDatetime')

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer  } = req.app.locals
  
  try {
    // get GET parameters
    var begin = req.query.begin >= 2 && req.query.begin || 2;// Default Value
    var end = req.query.end || -1;// Default Value is current timestamp
    var format = req.query.format || 'HTML';
    
    // get beginBlock and endBlock
    var beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `number` = '+begin+' LIMIT 1');
    var endBlock = null;
    if (end > 0)
    {
      endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`membersCount` FROM block WHERE `number` = '+end+' LIMIT 1');
      if ( typeof(endBlock[0]) == 'undefined')
      {
	endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`membersCount`,`number` FROM block ORDER BY `medianTime` DESC LIMIT 1');
	end = endBlock[0].number;
      }
    }
    else
    {
      endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`membersCount` FROM block ORDER BY `medianTime` DESC LIMIT 1');
    }
    
    // get blockchain
    if (end >= begin && begin >= 1)
    {
      var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`monetaryMass`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` <= '+endBlock[0].medianTime+' AND `medianTime` >= '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');
    }
    else
    {
      var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`monetaryMass`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` >= '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');
    }
    
    // get blockchain timestamp
    const currentBlockNumber = begin+blockchain.length-1;
    const currentBlockchainTimestamp = blockchain[blockchain.length-1].medianTime;
    if (end == -1) { end = begin+blockchain.length-1; }
    
    // create and fill tabMembersCount, tabMonetaryMass, tabCurrency and currentDividend
    var tabCurrency = [];
    var currentDividend = 0;
    let previousMonetaryMass = 0;
    for (let b=0;b<blockchain.length;b++)
    {
      if (blockchain[b].monetaryMass != previousMonetaryMass)
      {
        tabCurrency.push({
          blockNumber: blockchain[b].number,
          timestamp: blockchain[b].medianTime,
          dateTime: timestampToDatetime(blockchain[b].medianTime, true),
          membersCount: blockchain[b].membersCount,
          monetaryMass: parseInt(blockchain[b].monetaryMass / 100),
          monetaryMassPerMembers: parseFloat(((blockchain[b].monetaryMass / 100) / blockchain[b].membersCount).toFixed(2)),
          relativeMonetaryMass: 0,
          relativeMonetaryMassPerMembers: 0
        });
      
        if ( blockchain[b].dividend > 0 )
        {
          currentDividend = blockchain[b].dividend;
        }
        previousMonetaryMass = blockchain[b].monetaryMass;
      }
    }
    
    // calculate relativMonetaryMass
    for (let i=0;i<tabCurrency.length;i++)
    {
      tabCurrency[i].relativeMonetaryMass = parseFloat(((tabCurrency[i].monetaryMass / currentDividend) * 100).toFixed(2));
      tabCurrency[i].relativeMonetaryMassPerMembers = parseFloat(((tabCurrency[i].monetaryMassPerMembers / currentDividend) * 100).toFixed(2));
    }
    
    // Si le client demande la réponse au format JSON, le faire
    if (format == 'JSON')
      res.status(200).jsonp( tabCurrency )
    else
    {
      // GET parameters
      var unit = req.query.unit == 'quantitative' ? 'quantitative' : 'relative';
      var massByMembers = req.query.massByMembers == 'no' ? 'no' : 'yes';
      var type = req.query.type == 'linear' ? 'linear' : 'logarithmic';
      
      
    
      // Define full currency description
      let meanMonetaryMassAtFullCurrency = Math.ceil((1/duniterServer.conf.c)*(duniterServer.conf.dtReeval / duniterServer.conf.dt));
      var fullCurrency = "The currency will be full when the money supply by member will be worth <b>"+meanMonetaryMassAtFullCurrency
	  +" DU</b> (because 1/c * dtReeval/dt = <b>"+meanMonetaryMassAtFullCurrency+" DU</b>)<br>"
	  +"Currently, 1 DU<sub>"+duniterServer.conf.currency+"</sub> = <b>"+(currentDividend/100)+"</b> "+duniterServer.conf.currency+" and we have <b>"
	  +endBlock[0].membersCount+"</b> members. Thus in full currency we would have a total money supply of <b>"
	  +(meanMonetaryMassAtFullCurrency*currentDividend*endBlock[0].membersCount/100)+"</b> "+duniterServer.conf.currency
	  +" (<b>"+(meanMonetaryMassAtFullCurrency*currentDividend/100)+"</b> "+duniterServer.conf.currency+"/member)." ;
	  
      // Define max yAxes
      var maxYAxes = meanMonetaryMassAtFullCurrency;
      if (unit == "quantitative") { maxYAxes = maxYAxes*currentDividend/100; }
      if (massByMembers == "no") { maxYAxes = maxYAxes*endBlock[0].membersCount; }
      
      res.locals = {
	 host: req.headers.host.toString(),
         tabCurrency,
	 currentDividend,
         begin, 
         end,
         unit,
         massByMembers,
	 type,
         form: `Begin #<input type="number" name="begin" value="${begin}" min="0"> - End #<input type="number" name="end" value="${end}" min="1"> <select name="unit">
  <option name="unit" value ="quantitative">quantitative
  <option name="unit" value ="relative" ${unit == 'relative' ? 'selected' : ''}>relative
</select> <select name="massByMembers">
  <option name="massByMembers" value ="yes">mass by members
  <option name="massByMembers" value ="no" ${massByMembers == 'no' ? 'selected' : ''}>total mass
</select> <select name="type">
  <option name="type" value ="logarithmic">logarithmic
  <option name="type" value ="linear" ${type == 'linear' ? 'selected' : ''}>linear
</select>`,
	description: `${fullCurrency}`,
        chart: {
          type: 'bar',
          data: {
            labels: tabCurrency.map( item=> item.dateTime ),
            datasets: [{
              label: `#${unit == "relative" ? "DUğ1" : 'Ğ1'}${massByMembers == "yes" ? '/member' : ''}`,
              data: unit == 'quantitative' 
                ? tabCurrency.map( item=>
                    massByMembers == "no" 
                    ? item.monetaryMass 
                    : item.monetaryMassPerMembers)
                : tabCurrency.map( item=>
                    massByMembers == "no" 
                    ? item.relativeMonetaryMass 
                    : item.relativeMonetaryMassPerMembers),
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1
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
              text: `${unit == "relative" ? "DUğ1" : 'Ğ1'} Monetary Mass ${massByMembers == "yes" ? 'by members ' : ''}in the range #${begin}-#${end  }`
            },
            legend: {
              display: false
            },
            scales: {
              yAxes: [{
		type: type,
                position: 'left',
                ticks: {
                    min: 1,
                    max: maxYAxes
                }
              }]
            }
          }
        }
      }
      next()
    }
    
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
  }
})
