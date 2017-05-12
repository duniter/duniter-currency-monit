"use strict";

const co = require('co')
const timestampToDatetime = require('../lib/timestampToDatetime')
const getLang = require('../lib/getLang')

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow } = req.app.locals
  
  try {
    // get GET parameters
    var begin = req.query.begin || 0;// Default Value
    var end = req.query.end || -1;// Default Value is current timestamp
    var step = req.query.step > 0 && req.query.step || 1;// Default Value is 1
    var stepUnit = req.query.stepUnit || 'days';
    var format = req.query.format || 'HTML'
    
    // get beginBlock and endBlock
    var beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `number` = '+begin+' LIMIT 1');
    var endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `number` = '+end+' LIMIT 1');
    
    // get blockchain
    if (end >= begin && begin >= 0)
    {
      var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce`,`issuersCount` FROM block WHERE `fork`=0 AND `medianTime` <= '+endBlock[0].medianTime+' AND `medianTime` >= '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');
    }
    else
    {
      var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce`,`issuersCount` FROM block WHERE `fork`=0 AND `medianTime` >= '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');
    }
    
    // Get blockchain timestamp
    const currentBlockNumber = begin+blockchain.length-1;
    const currentBlockchainTimestamp = blockchain[blockchain.length-1].medianTime;
    if (end == -1) { end = begin+blockchain.length-1; }
    
    // Calculate stepTime
    var stepTime = 0;
    switch (stepUnit)
    {
      case "hours": stepTime += step*3600; break;
      case "days": stepTime += step*86400; break;
      case "weeks": stepTime += step*604800; break;
      case "months": stepTime += step*18144000; break;
      case "years": stepTime += step*31557600; break;
    }
    
    // Initialize nextStepTime and minIssuerCount
    var nextStepTime = blockchain[0].medianTime;
    let minIssuerCount = blockchain[0].membersCount; // max borne
    
    // Create and fill tabMembersCount
    var tabMembersCount = [];
    for (let b=0;b<blockchain.length;b++)
    {
      minIssuerCount = (blockchain[b].issuersCount < minIssuerCount) ? blockchain[b].issuersCount:minIssuerCount;
      if (blockchain[b].medianTime >= nextStepTime)
      {
	  tabMembersCount.push({
	    blockNumber: blockchain[b].number,
	    timestamp: blockchain[b].medianTime,
	    dateTime: timestampToDatetime(blockchain[b].medianTime),
	    membersCount: blockchain[b].membersCount,
	    issuersCount: minIssuerCount
	  });
	  
	  nextStepTime += stepTime;
	  minIssuerCount = blockchain[b].membersCount; // max borne
      }
    }
    
    // Add current block data
    tabMembersCount.push({
	    blockNumber: blockchain[blockchain.length-1].number,
	    timestamp: blockchain[blockchain.length-1].medianTime,
	    dateTime: timestampToDatetime(blockchain[blockchain.length-1].medianTime),
	    membersCount: blockchain[blockchain.length-1].membersCount,
	    issuersCount: blockchain[blockchain.length-1].issuersCount
	  });
    
    if (format == 'JSON')
      res.status(200).jsonp( tabMembersCount )
    else
    {
      // get lg file
      const LANG = getLang(`./lg/pubkeyBalance_${req.query.lg||'fr'}.txt`);
      
      // GET parameters
      var unit = req.query.unit == 'relative' ? 'relative' : 'quantitative';
      var massByMembers = req.query.massByMembers == 'no' ? 'no' : 'yes';
      
      
      res.locals = {
        tabMembersCount,
        begin, 
        end,
        form: `Begin #<input type="number" name="begin" value="${begin}" min="0"> - End #<input type="number" name="end" value="${end}" min="1"> - step <input type="number" name="step" value="${step}" min="1">
	  <select name="stepUnit">
	      <option name="stepUnit" value ="hours"${stepUnit == 'hours' ? 'selected' : ''}>${LANG["HOURS"]}
	      <option name="stepUnit" value ="days" ${stepUnit == 'days' ? 'selected' : ''}>${LANG["DAYS"]}
	      <option name="stepUnit" value ="weeks" ${stepUnit == 'weeks' ? 'selected' : ''}>${LANG["WEEKS"]}
	      <option name="stepUnit" value ="months" ${stepUnit == 'months' ? 'selected' : ''}>${LANG["MONTHS"]}
	      <option name="stepUnit" value ="years" ${stepUnit == 'years' ? 'selected' : ''}>${LANG["YEARS"]}
	    </select>`,
	description: ``,
        chart: {
          type: 'line',
          data: {
            labels: tabMembersCount.map(item=>item.dateTime),
            datasets: [{
              label: 'Members Count',
              data: tabMembersCount.map(item=>item.membersCount),
	      fill: false,
              backgroundColor: 'rgba(0, 0, 255, 0.5)',
              borderColor: 'rgba(0, 0, 255, 1)',
              borderWidth: 1
            },
	    {
              label: 'Issuers Count',
              data: tabMembersCount.map(item=>item.issuersCount),
	      fill: false,
              backgroundColor: 'rgba(255, 0, 0, 0.5)',
              borderColor: 'rgba(255, 0, 0, 1)',
              borderWidth: 1
            }
	    ]
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
              text: ' Members Count in the range #'+begin+'-#'+end
            },
            legend: {
              display: true
            },
            // scales: {
            //   yAxes: [{
            //     ticks: {
            //         beginAtZero:true
            //     }
            //   }]
            // }
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