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
		var pow = req.query.pow || 'no';
    
    // get lg file
    const LANG = getLang(`${__dirname}/../lg/membersCount_${req.query.lg||'fr'}.txt`); //
    
    // get medianTime of beginBlock
    var beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`hash` FROM block WHERE `fork`=0 AND `number` = '+cache.beginBlock[0].number+' LIMIT 1');
    
    // get blockchain
    var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `hash`,`membersCount`,`medianTime`,`number`,`certifications`,`issuersCount`,`powMin` FROM block WHERE `fork`=0 AND `medianTime` <= '+cache.endBlock[0].medianTime+' AND `medianTime` >= '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');

    
    // Get blockchain timestamp
    const currentBlockNumber = cache.beginBlock[0].number+blockchain.length-1;
    const currentBlockchainTimestamp = blockchain[blockchain.length-1].medianTime;
    
    // Traiter le cas stepUnit == "blocks"
    if (cache.stepUnit == "blocks")
    {
      if ( Math.ceil((cache.endBlock[0].number-cache.beginBlock[0].number)/cache.step) > STEP_COUNT_MAX  ) { cache.step = Math.ceil((cache.endBlock[0].number-cache.beginBlock[0].number)/STEP_COUNT_MAX); }
    }
    
    // Initialize nextStepTime, stepIssuerCount and bStep
    var nextStepTime = blockchain[0].medianTime;
    let stepIssuerCount = 0;
		let stepPowMin = 0;
    let bStep = 0;
    
    // Adapt nextStepTime initial value
    switch (cache.stepUnit)
    {
	  case "hours": nextStepTime -= (blockchain[0].medianTime % 3600); break;
	  case "days":case "weeks":case "months":case "years": nextStepTime -= (blockchain[0].medianTime % 86400); break;
	  default: break;
    }

    // fill tabMembersCount
    var tabMembersCount = [];
    let cacheIndex = 0;
    for (let b=0;b<blockchain.length;b++)
    {
      stepIssuerCount += blockchain[b].issuersCount;
			stepPowMin += blockchain[b].powMin;
      bStep++;
      
      while (cacheIndex < (cache.blockchain.length-1) && cache.blockchain[cacheIndex+1].number <= b) { cacheIndex++; }

      // If achieve next step
      if ( (cache.stepUnit == "blocks" && bStep == cache.step) || (cache.stepUnit != "blocks" && blockchain[b].medianTime >= nextStepTime))
      {
				let previousDateTime = "";
				if(tabMembersCount.length > 0)
				{
					previousDateTime = timestampToDatetime(tabMembersCount[tabMembersCount.length-1].timestamp, cache.onlyDate);
				}
				else
				{
					previousDateTime = timestampToDatetime(blockchain[0].medianTime);
				}
				let dateTime = "";
				if (cache.stepUnit != "blocks")
				{
					if (cache.step > 1)
					{
						switch (cache.stepUnit)
						{
							case "hours": dateTime = previousDateTime+" - "+timestampToDatetime(blockchain[b].medianTime, cache.onlyDate); break;
							case "days": dateTime = previousDateTime+" - "+timestampToDatetime(blockchain[b].medianTime-(cache.stepTime/cache.step), cache.onlyDate); break;
							case "weeks": dateTime = previousDateTime+" - "+timestampToDatetime(blockchain[b].medianTime, cache.onlyDate); break;
							case "months": dateTime = previousDateTime+" - "+timestampToDatetime(blockchain[b].medianTime, cache.onlyDate); break;
							case "years": dateTime = previousDateTime+" - "+timestampToDatetime(blockchain[b].medianTime, cache.onlyDate); break;
						}
					}
					else
					{
						dateTime = previousDateTime; 
					}
				}
				
				// push tabMembersCount
				tabMembersCount.push({
						blockNumber: blockchain[b].number,
						timestamp: blockchain[b].medianTime,
						dateTime: dateTime,
						membersCount: blockchain[b].membersCount,
						sentriesCount: cache.blockchain[cacheIndex].sentries,
						issuersCount: parseInt(stepIssuerCount/bStep),
						powMin: parseInt(stepPowMin/bStep)
				});
					
				if (cache.stepUnit != "blocks") { nextStepTime += cache.stepTime; }
				stepIssuerCount = 0;
				stepPowMin = 0;
				bStep = 0;
      }
    }
    
    // Add current block data (only if end parameter is undefined or negative)
    if (typeof(req.query.end) == 'undefined' || req.query.end <= 0)
		{
			tabMembersCount.push({
				blockNumber: blockchain[blockchain.length-1].number,
				timestamp: blockchain[blockchain.length-1].medianTime,
				dateTime: LANG['LAST_BLOCK'],
				membersCount: blockchain[blockchain.length-1].membersCount,
				sentriesCount: cache.blockchain[cache.blockchain.length-1].sentries,
				issuersCount: blockchain[blockchain.length-1].issuersCount,
				powMin: blockchain[blockchain.length-1].powMin
			});
		}
		
		// Delete first tabMembersCount cell
		tabMembersCount.splice(0, 1);
    
    if (format == 'JSON')
      res.status(200).jsonp( tabMembersCount )
    else
    {
      // GET parameters
      var unit = req.query.unit == 'relative' ? 'relative' : 'quantitative';
      var massByMembers = req.query.massByMembers == 'no' ? 'no' : 'yes';
			
			// Define datasets
			let datasets = [{
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
			}];
			
			if (pow == 'yes')
			{
				datasets.push({
					label: `${LANG["POW_MIN"]}`,
					data: tabMembersCount.map(item=>item.powMin),
					fill: false,
					backgroundColor: 'rgba(0, 0, 0, 0.5)',
					borderColor: 'rgba(0, 0, 0, 1)',
					borderWidth: 1
				});
			}
      
      res.locals = {
	host: req.headers.host.toString(),
        tabMembersCount,
        begin: cache.beginBlock[0].number,
        end: cache.endBlock[0].number,
        form: `${LANG["BEGIN"]} #<input type="number" name="begin" value="${cache.beginBlock[0].number}" min="0"> - ${LANG["END"]} #<input type="number" name="end" value="${cache.endBlock[0].number}" > - 		${LANG["STEP"]} <input type="number" name="step" value="${cache.step}" min="1">
					<select name="stepUnit">
						<option name="stepUnit" value ="blocks"${cache.stepUnit == 'blocks' ? 'selected' : ''}>${LANG["BLOCKS"]}
						<option name="stepUnit" value ="hours"${cache.stepUnit == 'hours' ? 'selected' : ''}>${LANG["HOURS"]}
						<option name="stepUnit" value ="days" ${cache.stepUnit == 'days' ? 'selected' : ''}>${LANG["DAYS"]}
						<option name="stepUnit" value ="weeks" ${cache.stepUnit == 'weeks' ? 'selected' : ''}>${LANG["WEEKS"]}
						<option name="stepUnit" value ="months" ${cache.stepUnit == 'months' ? 'selected' : ''}>${LANG["MONTHS"]}
						<option name="stepUnit" value ="years" ${cache.stepUnit == 'years' ? 'selected' : ''}>${LANG["YEARS"]}
					</select>`,
				description: `${LANG["DESCRIPTION1"]+'<br>'+LANG["DESCRIPTION2"]+'<b>'+cache.Yn+'</b>.'}`,
				form2: `<input type="checkbox" name="pow" value="yes" ${pow == 'yes' ? 'checked' : ''}> ${LANG["SHOW_POW_MIN"]}`,
        chart: {
          type: 'line',
          data: {
						labels: (cache.stepUnit == "blocks") ? tabMembersCount.map(item=>item.blockNumber):tabMembersCount.map(item=>item.dateTime),
						datasets: datasets,
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