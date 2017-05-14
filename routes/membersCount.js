"use strict";

const co = require('co')
const timestampToDatetime = require('../lib/timestampToDatetime')
const getLang = require('../lib/getLang')

const STEP_COUNT_LIMIT=150;

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow, sigQty, stepMax, cache } = req.app.locals
  
  try {
    // get GET parameters
    var begin = req.query.begin || 0;// Default Value
    var step = req.query.step > 0 && req.query.step || 1;// Default Value is 1
    var stepUnit = req.query.stepUnit || 'days';
    var format = req.query.format || 'HTML';
    
    // get medianTime of beginBlock and endBlock
    if (begin >= 0)
    {
        if (begin==1) { begin= 0; } // exclude begin 1 because blocks 1 and 0 are same medianTime
	var beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `fork`=0 AND `number` = '+begin+' LIMIT 1');
	if (beginBlock.length <= 0)
	{
	  res.status(500).send('<pre>Error : begin parameter is to high !</pre>');
	}
    }
    else
    {
	res.status(500).send('<pre>Error : begin parameter must be positive !</pre>');
    }
    if (cache.end >= 0)
    {
	if (cache.end >= parseInt(begin))
	{
	  var endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `fork`=0 AND `number` = '+cache.end+' LIMIT 1');
	}
	else
	{
	  res.status(500).send('<pre>Error : end parameter must be >= begin !</pre>');
	}
    }
    else
    {
	var endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block ORDER BY `medianTime` DESC LIMIT 1 ');
    }
    
    // get blockchain
    var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `hash`,`membersCount`,`medianTime`,`number`,`certifications`,`issuersCount` FROM block WHERE `fork`=0 AND `medianTime` <= '+endBlock[0].medianTime+' AND `medianTime` >= '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');

    
    // Get blockchain timestamp
    const currentBlockNumber = begin+blockchain.length-1;
    const currentBlockchainTimestamp = blockchain[blockchain.length-1].medianTime;
    
    // Apply STEP_COUNT_LIMIT and calculate stepTime
    var stepTime = 0;
    if (stepUnit == "blocks")
    {
      if ( Math.ceil((cache.end-begin)/step) > STEP_COUNT_LIMIT  ) { step = Math.ceil((cache.end-begin)/STEP_COUNT_LIMIT); }
    }
    else
    {
      let unitTime=0;
      switch (stepUnit)
      {
	case "hours": unitTime = 3600; break;
	case "days": unitTime = 86400; break;
	case "weeks": unitTime = 604800; break;
	case "months": unitTime = 18144000; break;
	case "years": unitTime = 31557600; break;
      }
      stepTime += step*unitTime;
      if ( Math.ceil((endBlock[0].medianTime-beginBlock[0].medianTime)/stepTime) > STEP_COUNT_LIMIT  )
      { step = Math.ceil((endBlock[0].medianTime-beginBlock[0].medianTime)/(STEP_COUNT_LIMIT*unitTime)); }
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
      if ( (bStep == step && stepUnit == "blocks") || blockchain[b].medianTime >= nextStepTime)
      {
	// push tabMembersCount
	tabMembersCount.push({
	    blockNumber: blockchain[b].number,
	    timestamp: blockchain[b].medianTime,
	    dateTime: timestampToDatetime(blockchain[b].medianTime),
	    membersCount: blockchain[b].membersCount,
	    sentriesCount: cache.blockchain[parseInt(begin)+b].sentries,
	    issuersCount: parseInt(stepIssuerCount/bStep)
	});
	  
	if (stepUnit != "blocks") { nextStepTime += stepTime; }
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
	    sentriesCount: cache.blockchain[parseInt(begin)+blockchain.length-1].sentries,
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
      
      
      res.locals = {
        tabMembersCount,
        begin, 
        end: cache.end,
        form: `${LANG["BEGIN"]} #<input type="number" name="begin" value="${begin}" min="0"> - ${LANG["END"]} #<input type="number" name="end" value="${cache.end}" min="1"> - ${LANG["STEP"]} <input type="number" name="step" value="${step}" min="1">
	  <select name="stepUnit">
	      <option name="stepUnit" value ="blocks"${stepUnit == 'blocks' ? 'selected' : ''}>${LANG["BLOCKS"]}
	      <option name="stepUnit" value ="hours"${stepUnit == 'hours' ? 'selected' : ''}>${LANG["HOURS"]}
	      <option name="stepUnit" value ="days" ${stepUnit == 'days' ? 'selected' : ''}>${LANG["DAYS"]}
	      <option name="stepUnit" value ="weeks" ${stepUnit == 'weeks' ? 'selected' : ''}>${LANG["WEEKS"]}
	      <option name="stepUnit" value ="months" ${stepUnit == 'months' ? 'selected' : ''}>${LANG["MONTHS"]}
	      <option name="stepUnit" value ="years" ${stepUnit == 'years' ? 'selected' : ''}>${LANG["YEARS"]}
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
              text: `${LANG['CHART_TITLE']+' #'+begin+'-#'+cache.end}`
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
