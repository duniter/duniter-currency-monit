"use strict";

const co = require('co')
const timestampToDatetime = require(__dirname + '/../lib/timestampToDatetime')
const getLang = require(__dirname + '/../lib/getLang')

const STEP_COUNT_MAX = 150;

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow, sigQty, stepMax, cache } = req.app.locals
  
  try {
    // get GET parameters
    var format = req.query.format || 'HTML';
    
    // get medianTime of beginBlock
    var beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`hash` FROM block WHERE `fork`=0 AND `number` = '+cache.beginBlock[0].number+' LIMIT 1');
    
    // get blockchain
    var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `hash`,`membersCount`,`medianTime`,`number`,`certifications`,`issuersCount` FROM block WHERE `fork`=0 AND `medianTime` <= '+cache.endBlock[0].medianTime+' AND `medianTime` >= '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');

    
    // Get blockchain timestamp
    const currentBlockNumber = cache.beginBlock[0].number+blockchain.length-1;
    const currentBlockchainTimestamp = blockchain[blockchain.length-1].medianTime;
    
    // Traiter le cas stepUnit == "blocks"
    if (cache.stepUnit == "blocks")
    {
      if ( Math.ceil((cache.endBlock[0].number-cache.beginBlock[0].number)/cache.step) > STEP_COUNT_MAX  ) { cache.step = Math.ceil((cache.endBlock[0].number-cache.beginBlock[0].number)/STEP_COUNT_MAX); }
    }
    
    // Initialize nextStepTimen, stepIssuerCount and bStep
    var nextStepTime = blockchain[0].medianTime;
    let stepIssuerCount = 0;
    let bStep = 0;

    // fill tabMembersCount
    var tabMembersCount = [];
    for (let b=0;b<blockchain.length;b++)
    {
      stepIssuerCount += blockchain[b].issuersCount;
      bStep++;

      // If achieve next step
      if ( (cache.stepUnit == "blocks" && bStep == cache.step) || (cache.stepUnit != "blocks" && blockchain[b].medianTime >= nextStepTime))
      {
	// push tabMembersCount
	tabMembersCount.push({
	    blockNumber: blockchain[b].number,
	    timestamp: blockchain[b].medianTime,
	    dateTime: timestampToDatetime(blockchain[b].medianTime),
	    membersCount: blockchain[b].membersCount,
	    sentriesCount: cache.blockchain[parseInt(cache.beginBlock[0].number)+b].sentries,
	    issuersCount: parseInt(stepIssuerCount/bStep)
	});
	  
	if (cache.stepUnit != "blocks") { nextStepTime += cache.stepTime; }
	stepIssuerCount = 0;
	bStep = 0;
      }
    }
    
    // Add current block data
    tabMembersCount.push({
	    blockNumber: blockchain[blockchain.length-1].number,
	    timestamp: blockchain[blockchain.length-1].medianTime,
	    dateTime: timestampToDatetime(blockchain[blockchain.length-1].medianTime),
	    membersCount: blockchain[blockchain.length-1].membersCount,
	    sentriesCount: cache.blockchain[parseInt(cache.beginBlock[0].number)+blockchain.length-1].sentries,
	    issuersCount: blockchain[blockchain.length-1].issuersCount
	  });
    
    if (format == 'JSON')
      res.status(200).jsonp( tabMembersCount )
    else
    {
      // get lg file
      const LANG = getLang(`./lg/membersCount_${req.query.lg||'fr'}.txt`);
      
      // GET parameters
      var unit = req.query.unit == 'relative' ? 'relative' : 'quantitative';
      var massByMembers = req.query.massByMembers == 'no' ? 'no' : 'yes';
      
      console.log("req.headers.host = %s", req.headers.host);
      
      res.locals = {
	host: req.headers.host.toString(),
        tabMembersCount,
        begin: cache.beginBlock[0].number,
        end: cache.endBlock[0].number,
        form: `${LANG["BEGIN"]} #<input type="number" name="begin" value="${cache.beginBlock[0].number}" min="0"> - ${LANG["END"]} #<input type="number" name="end" value="${cache.endBlock[0].number}" min="1"> - ${LANG["STEP"]} <input type="number" name="step" value="${cache.step}" min="1">
	  <select name="stepUnit">
	      <option name="stepUnit" value ="blocks"${cache.stepUnit == 'blocks' ? 'selected' : ''}>${LANG["BLOCKS"]}
	      <option name="stepUnit" value ="hours"${cache.stepUnit == 'hours' ? 'selected' : ''}>${LANG["HOURS"]}
	      <option name="stepUnit" value ="days" ${cache.stepUnit == 'days' ? 'selected' : ''}>${LANG["DAYS"]}
	      <option name="stepUnit" value ="weeks" ${cache.stepUnit == 'weeks' ? 'selected' : ''}>${LANG["WEEKS"]}
	      <option name="stepUnit" value ="months" ${cache.stepUnit == 'months' ? 'selected' : ''}>${LANG["MONTHS"]}
	      <option name="stepUnit" value ="years" ${cache.stepUnit == 'years' ? 'selected' : ''}>${LANG["YEARS"]}
	    </select>`,
	description: `${LANG["DESCRIPTION1"]+'<br>'+LANG["DESCRIPTION2"]+'<b>'+cache.Yn+'</b>.'}`,
        chart: {
          type: 'line',
          data: {
            labels: tabMembersCount.map(item=>item.dateTime),
            datasets: [{
              label: `${LANG["MEMBERS_COUNT"]}`,
              data: tabMembersCount.map(item=>item.membersCount),
	      fill: false,
              backgroundColor: 'rgba(0, 0, 255, 0.5)',
              borderColor: 'rgba(0, 0, 255, 1)',
              borderWidth: 1
            },
	    {
              label: `${LANG["SENTRIES_COUNT"]}`,
              data: tabMembersCount.map(item=>item.sentriesCount),
	      fill: false,
              backgroundColor: 'rgba(0, 255, 0, 0.5)',
              borderColor: 'rgba(0, 255, 0, 1)',
              borderWidth: 1
            },
	    {
              label: `${LANG["ISSUERS_COUNT"]}`,
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
              text: `${LANG['CHART_TITLE']+' #'+cache.beginBlock[0].number+'-#'+cache.endBlock[0].number}`
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