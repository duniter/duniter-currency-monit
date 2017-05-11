"use strict";

const co = require('co')
const timestampToDatetime = require('../lib/timestampToDatetime')

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow } = req.app.locals
  
  try {
    // get GET parameters
    var begin = req.query.begin || 0;// Default Value
    var end = req.query.end || -1;// Default Value is current timestamp
    var step = req.query.step > 0 && req.query.step || 1;// Default Value is 1
    var format = req.query.format || 'HTML'
    
    // get beginBlock and endBlock
    var beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `number` = '+begin+' LIMIT 1');
    var endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `number` = '+end+' LIMIT 1');
    
    // get blockchain
    if (end >= begin && begin >= 0)
    {
      var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` <= '+endBlock[0].medianTime+' AND `medianTime` >= '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');
    }
    else
    {
      var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` >= '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');
    }
    
    // get blockchain timestamp
    const currentBlockNumber = begin+blockchain.length-1;
    const currentBlockchainTimestamp = blockchain[blockchain.length-1].medianTime;
    if (end == -1) { end = begin+blockchain.length-1; }
    
    // create and fill tabMembersCount
    var tabMembersCount = [];
    var currentStepDU = 0;
    for (let b=0;b<blockchain.length;b++)
    {
      if (blockchain[b].dividend > 0)
      {
        currentStepDU++;
	if (currentStepDU == step)
	{
	  currentStepDU = 0;
	  tabMembersCount.push({
	    blockNumber: blockchain[b].number,
	    timestamp: blockchain[b].medianTime,
	    dateTime: timestampToDatetime(blockchain[b].medianTime),
	    membersCount: blockchain[b].membersCount,
	  });
	}
      }
    }
    
    // Add current block data
    tabMembersCount.push({
	    blockNumber: blockchain[currentBlockNumber-begin].number,
	    timestamp: blockchain[currentBlockNumber-begin].medianTime,
	    dateTime: timestampToDatetime(blockchain[currentBlockNumber-begin].medianTime),
	    membersCount: blockchain[currentBlockNumber-begin].membersCount,
	  });
    
    if (format == 'JSON')
      res.status(200).jsonp( tabMembersCount )
    else
    {
      // GET parameters
      var unit = req.query.unit == 'relative' ? 'relative' : 'quantitative';
      var massByMembers = req.query.massByMembers == 'no' ? 'no' : 'yes';
      
      
      res.locals = {
        tabMembersCount,
        begin, 
        end,
        form: `Begin #<input type="number" name="begin" value="${begin}" min="0"> - End #<input type="number" name="end" value="${end}" min="1"> - step <input type="number" name="step" value="${step}" min="1">`,
	description: ``,
        chart: {
          type: 'line',
          data: {
            labels: tabMembersCount.map(item=>item.dateTime),
            datasets: [{
              label: '#Members Count',
              data: tabMembersCount.map(item=>item.membersCount),
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
              text: ' Members Count in the range #'+begin+'-#'+end
            },
            legend: {
              display: false
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
