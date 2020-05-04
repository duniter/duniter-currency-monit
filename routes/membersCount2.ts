import {DataFinder} from "../lib/DataFinder";
import {MonitConstants} from "../lib/constants2";

const co = require('co')
const timestampToDatetime = require(__dirname + '/../lib/timestampToDatetime')
const getLang = require(__dirname + '/../lib/getLang')

//const STEP_COUNT_MAX = 150;

module.exports = async (req: any, res: any, next: any) => {

  var { cache } = req.app.locals

	const dataFinder = await DataFinder.getInstanceReindexedIfNecessary()

  try {
    // get GET parameters
    var format = req.query.format || 'HTML';
		var pow = req.query.pow || 'no';

    // get lg file
		const LANG = getLang(`${__dirname}/../lg/membersCount_${req.query.lg||MonitConstants.DEFAULT_LANGUAGE}.txt`);

    // get blockchain
    var blockchain = await dataFinder.getBlockWhereMedianTimeLteNoLimit(cache.endBlock[0].medianTime);


    // Get blockchain timestamp
    const currentBlockNumber = cache.beginBlock[0].number+blockchain.length-1;
    const currentBlockchainTimestamp = blockchain[blockchain.length-1].medianTime;

    // Initialize nextStepTime, stepIssuerCount and bStep
    var nextStepTime = cache.beginBlock[0].medianTime;
    let stepIssuerCount = 0;
		let stepPowMin = 0;
    let bStep = 0;

    // Adapt nextStepTime initial value
    switch (cache.stepUnit)
    {
			case "hours": nextStepTime -= (cache.beginBlock[0].medianTime % 3600); break;
			case "days":case "weeks":case "months":case "years": nextStepTime -= (cache.beginBlock[0].medianTime % 86400); break;
			default: break;
		}

		// Calculate initial cacheIndex value
		let cacheIndex = 0;
		while (cache.blockchain[cacheIndex].number <= cache.beginBlock[0].number && (cache.blockchain.length-1) > cacheIndex) { cacheIndex++; }
		console.log("cache.blockchain[cacheIndex].number = %s", cache.blockchain[cacheIndex].number); // DEBUG

    // fill tabMembersCount
    var tabMembersCount = [];
    for (let b=cache.beginBlock[0].number;b<blockchain.length;b++)
    {
      stepIssuerCount += blockchain[b].issuersCount;
			stepPowMin += blockchain[b].powMin;
			bStep++;

      // If achieve next step
		if ( b==cache.beginBlock[0].number || (cache.stepUnit == "blocks" && bStep == cache.step) || (cache.stepUnit != "blocks" && blockchain[b].medianTime >= nextStepTime/*(tabMembersCount[tabMembersCount.length-1].timestamp+cache.stepTime)*/))
      {
				let blockIndex = b;//-cache.beginBlock[0].number;//b-blockchain[0].number;

				// Calculate if increment cacheIndex
				while ((cache.blockchain.length-1) > cacheIndex && cache.blockchain[cacheIndex].number <= b) { cacheIndex++; }

				let previousDateTime = "";
				if(tabMembersCount.length > 0)
				{
					previousDateTime = timestampToDatetime(tabMembersCount[tabMembersCount.length-1].timestamp, cache.onlyDate);
				}
				else
				{
					previousDateTime = timestampToDatetime(cache.beginBlock[0].medianTime);
				}
				let dateTime = "";
				if (cache.stepUnit != "blocks")
				{
					if (cache.step > 1)
					{
						switch (cache.stepUnit)
						{
							case "hours": dateTime = previousDateTime+" - "+timestampToDatetime(blockchain[blockIndex].medianTime, cache.onlyDate); break;
							case "days": dateTime = previousDateTime+" - "+timestampToDatetime(blockchain[blockIndex].medianTime-(cache.stepTime/cache.step), cache.onlyDate); break;
							case "weeks": dateTime = previousDateTime+" - "+timestampToDatetime(blockchain[blockIndex].medianTime, cache.onlyDate); break;
							case "months": dateTime = previousDateTime+" - "+timestampToDatetime(blockchain[blockIndex].medianTime, cache.onlyDate); break;
							case "years": dateTime = previousDateTime+" - "+timestampToDatetime(blockchain[blockIndex].medianTime, cache.onlyDate); break;
						}
					}
					else
					{
						dateTime = previousDateTime;
					}
				}

				// push tabMembersCount
				tabMembersCount.push({
						blockNumber: blockchain[blockIndex].number,
						timestamp: blockchain[blockIndex].medianTime,
						dateTime: dateTime,
						membersCount: blockchain[blockIndex].membersCount,
						sentriesCount: cache.blockchain[cacheIndex].sentries,
						issuersCount: parseInt(String(stepIssuerCount/bStep)),
						powMin: parseInt(String(stepPowMin/bStep))
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
        form: `${LANG["BEGIN"]} #<input type="number" name="begin" value="${cache.beginBlock[0].number}" min="0" size="7" style="width:60px;"> - ${LANG["END"]} #<input type="number" name="end" value="${cache.endBlock[0].number}" size="7" style="width:60px;"> - 		${LANG["STEP"]} <input type="number" name="step" value="${cache.step}" min="1" size="4" style="width:50px;">
					<select name="stepUnit">
						<option name="stepUnit" value ="blocks" ${cache.stepUnit == 'blocks' ? 'selected' : ''}>${LANG["BLOCKS"]}
						<option name="stepUnit" value ="hours" ${cache.stepUnit == 'hours' ? 'selected' : ''}>${LANG["HOURS"]}
						<option name="stepUnit" value ="days" ${cache.stepUnit == 'days' ? 'selected' : ''}>${LANG["DAYS"]}
						<option name="stepUnit" value ="weeks" ${cache.stepUnit == 'weeks' ? 'selected' : ''}>${LANG["WEEKS"]}
						<option name="stepUnit" value ="months" ${cache.stepUnit == 'months' ? 'selected' : ''}>${LANG["MONTHS"]}
						<option name="stepUnit" value ="years" ${cache.stepUnit == 'years' ? 'selected' : ''}>${LANG["YEARS"]}
					</select> - ${LANG["MAX"]} <input type="number" name="nbMaxPoints" value="${cache.nbMaxPoints}" min="1" size="4" style="width:50px;"> ${LANG["POINTS"]} (${LANG["REGULATE_BY_ADAPTING"]} 
					<select name="adaptMaxPoints">
						<option name="adaptMaxPoints" value ="begin"> ${LANG["BEGIN"]}
						<option name="adaptMaxPoints" value ="step" ${cache.adaptMaxPoints == 'step' ? 'selected' : ''}> ${LANG["STEP"]}
						<option name="adaptMaxPoints" value ="end" ${cache.adaptMaxPoints == 'end' ? 'selected' : ''}> ${LANG["END"]}
					</select>)`,
				description: `${LANG["DESCRIPTION1"]+'<br>'+LANG["DESCRIPTION2"]+'<b>'+cache.Yn+'</b>.'}`,
				form2: `
					<input type="checkbox" name="pow" value="yes" ${pow == 'yes' ? 'checked' : ''}> ${LANG["SHOW_POW_MIN"]}`,
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
}
