"use strict";

const co = require('co')
const timestampToDatetime = require(__dirname + '/../lib/timestampToDatetime')
const colorScale = require(__dirname + '/../lib/colorScale')
const getLang = require(__dirname + '/../lib/getLang')

const STEP_COUNT_LIMIT=150;

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow, cache  } = req.app.locals
  
  try {
    // get GET parameters
    var format = req.query.format || 'HTML';
    var pubkey1 = req.query.pubkey1 || '';
    var mode = req.query.mode == 'balanceWithOthers' ? 'balanceWithOthers' : 'selfBalance';
    var unit = req.query.unit == 'relative' ? 'relative' : 'quantitative';
    
    // get medianTime of beginBlock
    var beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`hash` FROM block WHERE `fork`=0 AND `number` = '+cache.beginBlock[0].number+' LIMIT 1');
    
    // Traiter le cas stepUnit == "blocks"
    if (cache.stepUnit == "blocks") { cache.stepUnit == "hours" }
      
    if (pubkey1.length > 0)
    {
    
      // If pubkey1 is uid, change to corresponding pubkey
      var pubkeyUid1 = yield duniterServer.dal.peerDAL.query('SELECT `pub` FROM i_index WHERE `uid`=\''+pubkey1+'\' LIMIT 1');
      if ( pubkeyUid1.length > 0 ) { pubkey1 = pubkeyUid1[0].pub; }

      // If pubkey1 wasMember, get all dividend created by pubkey1
      var pubkey1WasMember = false;
      var idtyPubkey1 = yield duniterServer.dal.peerDAL.query('SELECT `written_on`,`uid` FROM i_index WHERE `pub`=\''+pubkey1+'\' AND `wasMember`=1 LIMIT 1');
      if (idtyPubkey1.length > 0)
      {
	pubkey1WasMember = true;
	
	// get joinersTimePubkey1
	let joinersBlockPubkey1 = idtyPubkey1[0].written_on.split("-");
	let joinersTimePubkey1 = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `fork`=0 AND `number`=\''+joinersBlockPubkey1[0]+'\' LIMIT 1');
	
	
	// get all dividend created by pubkey1
	var pubkey1Dividends = yield duniterServer.dal.peerDAL.query('SELECT `dividend`,`medianTime`,`number` FROM block WHERE `fork`=0 AND `dividend` > 0 '
	  +'AND `medianTime` >\''+joinersTimePubkey1[0].medianTime+'\' AND `medianTime` <=\''+cache.endBlock[0].medianTime+'\' '
	  +'ORDER BY `medianTime` ASC');
      }
      
      // Get cache infos for pubkey1
      var pubkey1Cache = null;
      if (typeof(cache.pubkeys[cache.pub_index[pubkey1]]) != 'undefined')
      { pubkey1Cache = cache.pubkeys[cache.pub_index[pubkey1]]; }
      
      // get currentDividend
      var currentDividend = yield duniterServer.dal.peerDAL.query('SELECT `dividend` FROM block WHERE `fork`=0 AND `dividend` > 0 ORDER BY `medianTime` DESC LIMIT 1');
      
      if (pubkey1Cache != null)
      {
	// If mode is "balanceWithOthers", initialize, full and sort tabBalanceWithOthers
	if (mode == "balanceWithOthers")
	{
	  // initialize
	  var tabIndexOthers = new Array();
	  var tabBalanceWithOthers = new Array();
	  let pubkeyId = cache.pub_index[pubkey1];
	  
	  // full
	  for (let i=0;i<cache.pubkeys.length;i++)
	  {
	    if (cache.pubkeys[i].pub == pubkey1)
	    {
	      for (let key in cache.pubkeys[i].pubkeyBalanceWithOthers)
	      {
		let idKey = cache.pubkeys[i].pubkeyBalanceWithOthers[key];
		let idBalance = -1;
		  for (let j=0;j<tabIndexOthers.length;j++)
		  {
		    if (tabIndexOthers[j] == cache.pubkeys[i].pub) { idBalance = j; }
		  }
		  if (idBalance < 0)
		  {
		    let idtyKey = yield duniterServer.dal.peerDAL.query('SELECT `uid` FROM i_index WHERE `pub`=\''+key+'\' AND `wasMember`=1 LIMIT 1');
		    if (idtyKey.length > 0) { tabIndexOthers.push(idtyKey[0].uid); }
		    else { tabIndexOthers.push(key.toString().substr(0, 12)); }
		    tabBalanceWithOthers.push(0);
		    idBalance = tabBalanceWithOthers.length-1;
		  }
		  if (unit == 'quantitative') { tabBalanceWithOthers[idBalance] += (parseFloat((cache.pubkeys[i].balanceWithOthers[idKey]/100).toFixed(2))); }
		  else if (unit == 'relative') { tabBalanceWithOthers[idBalance] += (parseFloat((cache.pubkeys[i].balanceWithOthers[idKey]/currentDividend[0].dividend).toFixed(2))); }
	      }
	    }
	    else
	    {
	      for (let key in cache.pubkeys[i].pubkeyBalanceWithOthers)
	      {
		let idPubkey1 = cache.pubkeys[i].pubkeyBalanceWithOthers[pubkey1];
		if (key == pubkey1)
		{
		  let idBalance = -1;
		  for (let j=0;j<tabIndexOthers.length;j++)
		  {
		    if (tabIndexOthers[j] == cache.pubkeys[i].pub) { idBalance = j; }
		  }
		  if (idBalance < 0)
		  {
		    let idtyKey = yield duniterServer.dal.peerDAL.query('SELECT `uid` FROM i_index WHERE `pub`=\''+cache.pubkeys[i].pub+'\' AND `wasMember`=1 LIMIT 1');
		    if (idtyKey.length > 0) { tabIndexOthers.push(idtyKey[0].uid); }
		    else { tabIndexOthers.push(cache.pubkeys[i].pub.toString().substr(0, 12)); }
		    tabBalanceWithOthers.push(0);
		    idBalance = tabBalanceWithOthers.length-1;
		  }
		  if (unit == 'quantitative') { tabBalanceWithOthers[idBalance] += (parseFloat((-cache.pubkeys[i].balanceWithOthers[idPubkey1]/100).toFixed(2))); }
		  else if (unit == 'relative') { tabBalanceWithOthers[idBalance] += (parseFloat((-cache.pubkeys[i].balanceWithOthers[idPubkey1]/currentDividend[0].dividend).toFixed(2))); }
		}
	      }
	    }
	  }
	  
	  // sort
	  var tabBalanceWithOthersOrdered = new Array();
	  var tabIndexOthersOrdered = new Array();
	  
	  while (tabBalanceWithOthers.length > 0)
	  {
	    let idMin = 0;
	    let min = tabBalanceWithOthers[0];
	    for (let i=0;i<tabBalanceWithOthers.length;i++)
	    {
	      if (parseFloat(tabBalanceWithOthers[i]) <= min)
	      {
		min = parseFloat(tabBalanceWithOthers[i]);
		idMin = i;
	      }
	    }
	    
	    // push tabBalanceWithOthersOrdered and tabIndexOthersOrdered (if value is not null)
	    if (parseFloat(tabBalanceWithOthers[idMin]) != 0.0)
	    {
	      tabBalanceWithOthersOrdered.push(tabBalanceWithOthers[idMin]);
	      tabIndexOthersOrdered.push(tabIndexOthers[idMin]);
	    }
	    
	    // splice tabBalanceWithOthers and tabIndexOthers
	    tabBalanceWithOthers.splice(idMin, 1);
	    tabIndexOthers.splice(idMin, 1);
	  }
	}
	
	// Initialize tabDividend and pubkey1Dividend
	if (pubkey1WasMember) { var tabDividend = [];  var pubkey1Dividend = 0; }
	
	// Initialize tabTimes, tabBalance, tabInputsBalance, tabOutputsBalance, tabTxBalance, tabDividend, tabMeanCurrencyMass, nextStepTime and idDividend
	var tabTimes = new Array();
	var tabBalance = new Array();
	var tabInputsBalance = new Array();
	var tabOutputsBalance = new Array();
	if (pubkey1WasMember) { var tabTxBalance = new Array(); var tabDividend= new Array(); }
	var tabMeanCurrencyMass = [];
	var nextStepTime = cache.blockchain[1].medianTime; // begin time at first dividend block (#1)
	var idDividend = 0;
	
	// Initialize idInputs and idOutputs
	var idInputs = 0;
	var idOutputs = 0;
	
	// stepTime loop
	while (nextStepTime < (parseInt(cache.endBlock[0].medianTime)+cache.stepTime))
	{
	  // Initialize sumStepDividends, sumStepInputs, sumStepOutputs
	  let sumStepDividends = 0;
	  let sumStepInputs = 0;
	  let sumStepOutputs = 0;
	  
	  // Calculate sum dividends of current step
	  if (pubkey1WasMember)
	  {
	    while (idDividend < pubkey1Dividends.length && pubkey1Dividends[idDividend].medianTime <= nextStepTime)
	    {
	      sumStepDividends += parseInt(pubkey1Dividends[idDividend].dividend);
	      idDividend++;
	    }
	  }
	  
	  // Calculate sum inputs of current step
	  if ( typeof(pubkey1Cache.inputsTime) != 'undefined' && pubkey1Cache.inputsTime.length > 0 )
	  while ( parseInt(pubkey1Cache.inputsTime[idInputs]) <= parseInt(nextStepTime) )
	  {
	    sumStepInputs += pubkey1Cache.inputsAmount[idInputs];
	    idInputs++;
	  }
	  
	  // Calculate sum outputs of current step
	  while ( parseInt(pubkey1Cache.outputsTime[idOutputs]) <= parseInt(nextStepTime) )
	  {
	    sumStepOutputs += pubkey1Cache.outputsAmount[idOutputs];
	    idOutputs++;
	  }

	  // If achieve beginTime, push tabTimes, tabBalance, tabInputsBalance, tabOutputsBalance, tabTxBalance, tabDividend, tabMeanCurrencyMass
	  if (nextStepTime >= parseInt(beginBlock[0].medianTime))
	  {
	    // Get lastDividendBlock
	    if (nextStepTime > (parseInt(cache.endBlock[0].medianTime))) { tabTimes.push(timestampToDatetime(cache.endBlock[0].medianTime, cache.onlyDate)); }
	    else { tabTimes.push(timestampToDatetime(nextStepTime, cache.onlyDate)); }
	    let lastDividendBlock = yield duniterServer.dal.peerDAL.query(
	      'SELECT `membersCount`,`monetaryMass`,`dividend` FROM block WHERE `fork`=0 AND `dividend` > 0 AND `medianTime` <= \''+nextStepTime+'\' ORDER BY `medianTime` DESC LIMIT 1');
	  
	    let previousBalance, previousTabTxBalance, previousTabDividend;
	    if (tabBalance.length > 0)
	    {
	      previousBalance = tabBalance[tabBalance.length-1];
	      if (pubkey1WasMember)
	      {
		previousTabTxBalance = tabTxBalance[tabTxBalance.length-1];
		previousTabDividend = tabDividend[tabDividend.length-1];
	      }
	    }
	    else   
	    {
	      previousBalance = 0;
	      if (pubkey1WasMember)
	      {
		previousTabTxBalance = 0;
		previousTabDividend = 0;
	      }
	    }
	    
	    tabBalance.push(parseFloat((previousBalance+parseFloat(((sumStepDividends+sumStepOutputs-sumStepInputs)/100).toFixed(2))).toFixed(2)));
	    tabInputsBalance.push(-parseFloat((sumStepInputs/100).toFixed(2)));
	    tabOutputsBalance.push(parseFloat((sumStepOutputs/100).toFixed(2)));
	    tabMeanCurrencyMass.push(parseFloat((lastDividendBlock[0].monetaryMass/(lastDividendBlock[0].membersCount*100)).toFixed(2)));
	    if (pubkey1WasMember)
	    {
	      tabTxBalance.push(parseFloat((previousTabTxBalance+parseFloat(((sumStepOutputs-sumStepInputs)/100).toFixed(2))).toFixed(2)));
	      tabDividend.push(parseFloat((previousTabDividend+parseFloat((sumStepDividends/100).toFixed(2))).toFixed(2)));
	    }
	  }
	  // If no startChart, add step sums to tabs for calculate begin balances  
	  else
	  {
	    // If is the first step
	    if (tabBalance.length == 0 )
	    {
	      tabBalance.push(0);
	      tabInputsBalance.push(0);
	      tabOutputsBalance.push(0);
	      if (pubkey1WasMember)
	      {
		tabTxBalance.push(0);
		tabDividend.push(0);
	      }
	    }
	    
	    tabBalance[0] += parseFloat(((parseInt(sumStepDividends)+sumStepOutputs-sumStepInputs)/100).toFixed(2));
	    /*tabInputsBalance[0] -= parseFloat((sumStepInputs/100).toFixed(2));
	    tabOutputsBalance[0] += parseFloat((sumStepOutputs/100).toFixed(2));*/
	    if (pubkey1WasMember)
	    {
	      tabTxBalance[0] += parseFloat(((sumStepOutputs-sumStepInputs)/100).toFixed(2));
	      tabDividend[0] += parseFloat((parseInt(sumStepDividends)/100).toFixed(2));
	    }
	  }
	  
	  // Increment nextStepTime
	  nextStepTime += cache.stepTime;
	}
      
	// Apply Relative
	if (unit == 'relative')
	{
	  for(let i=0;i<tabTimes.length;i++)
	  {
	    // Get lastDividendBlock
	    let lastDividendBlock = yield duniterServer.dal.peerDAL.query(
	      'SELECT `dividend` FROM block WHERE `fork`=0 AND `dividend` > 0 AND `medianTime` <= \''+tabTimes[i]+'\' ORDER BY `medianTime` DESC LIMIT 1');
	    
	    tabBalance[i] = parseFloat((100 * tabBalance[i] / lastDividendBlock[0].dividend).toFixed(2));
	    tabInputsBalance[i] = parseFloat((100 * tabInputsBalance[i] / lastDividendBlock[0].dividend).toFixed(2));
	    tabOutputsBalance[i] = parseFloat((100 * tabOutputsBalance[i] / lastDividendBlock[0].dividend).toFixed(2));
	    tabMeanCurrencyMass[i] = parseFloat((100 * tabMeanCurrencyMass[i] / lastDividendBlock[0].dividend).toFixed(2));
	    if (pubkey1WasMember)
	    {
		tabTxBalance[i] = parseFloat((100 * tabTxBalance[i] / lastDividendBlock[0].dividend).toFixed(2));
		tabDividend[i] = parseFloat((100 * tabDividend[i] / lastDividendBlock[0].dividend).toFixed(2));
	    }
	  }
	}
      }
    }
    if (format == 'JSON')
    {
      var tabJson = new Array();
      if (pubkey1Cache != null)
      {
	if (mode == 'selfBalance')
	{
	  for (let i=0;i<tabBalance.length;i++)
	  {
	    if (pubkey1WasMember)
	    {
	      tabJson.push({
		    time: tabTimes[i],
		    balance: tabBalance[i],
		    inputsSum: tabInputsBalance[i],
		    outputsSum: tabOutputsBalance[i],
		    meanCurrencyMass: tabMeanCurrencyMass[i],
		    txBalance: tabTxBalance[i],
		    dividends: tabDividend[i]
		  });
	    }
	    else
	    {
	      tabJson.push({
		    time: tabTimes[i],
		    balance: tabBalance[i],
		    inputsSum: tabInputsBalance[i],
		    outputsSum: tabOutputsBalance[i],
		    meanCurrencyMass: tabMeanCurrencyMass[i]
		  });
	    }
	  }
	}
	else if (mode == 'balanceWithOthers')
	{
	  for(let i=0;i<tabIndexOthersOrdered.length;i++)
	  {
	    tabJson.push({
		    pubkey: tabIndexOthersOrdered[i],
		    balance: tabBalanceWithOthersOrdered[i]
		  });
	  }
	}
      }
      else { tabJson.push(0); }
      res.status(200).jsonp( tabJson )
    }
    else
    {
      const LANG = getLang(`./lg/pubkeyBalance_${req.query.lg||'fr'}.txt`);
      var datasets = new Array();
      if (pubkey1.length > 0 && pubkey1Cache != null)
      {
	if (mode == "selfBalance")
	{
	  datasets.push({
		    label: LANG["LEGEND_TOTAL_BALANCE"]+' ('+((unit == "relative") ? LANG["UNIT_R"]:LANG["UNIT_Q"])+')',
		    data: tabBalance,
		    fill: false,
		    backgroundColor: 'rgba(0, 162, 245, 0.5)',
		    borderColor: 'rgba(0, 162, 245, 1)',
		    borderWidth: 1,
		    hoverBackgroundColor: 'rgba(0, 162, 245, 0.2)',
		    hoverborderColor: 'rgba(0, 162, 245, 0.2)'
		  });
	  datasets.push({
		    label: `${unit == "relative" ? "(M/N) DUğ1" : '(M/N) ğ1'}`,
		    data: tabMeanCurrencyMass,
		    fill: false,
		    backgroundColor: 'rgba(255, 128, 0, 0.5)',
		    borderColor: 'rgba(255, 128, 0, 1)',
		    borderWidth: 1,
		    hoverBackgroundColor: 'rgba(255, 128, 0, 0.2)',
		    hoverborderColor: 'rgba(255, 128, 0, 0.2)'
		  });
	  datasets.push({
		    label: LANG["LEGEND_INPUTS_MOVES"]+' ('+((unit == "relative") ? LANG["UNIT_R"]:LANG["UNIT_Q"])+')',
		    data: tabInputsBalance,
		    fill: false,
		    lineTension: 0,
		    //steppedLine: true,
		    //showLine: false,
		    pointStyle: 'line',
		    pointStyle: 'line',
		    pointHoverRadius: 5,
		    pointHoverBackgroundColor: "rgba(255, 0, 0,1)",
		    pointHoverBorderColor: "rgba(255, 0, 0,1)",
		    pointHoverBorderWidth: 4,
		    backgroundColor: 'rgba(255, 0, 0, 0.5)',
		    borderColor: 'rgba(255, 0, 0, 1)',
		    borderWidth: 2
		  });
	  datasets.push({
		    label: LANG["LEGEND_OUTPUTS_MOVES"]+' ('+((unit == "relative") ? LANG["UNIT_R"]:LANG["UNIT_Q"])+')',
		    data: tabOutputsBalance,
		    fill: false,
		    lineTension: 0,
		    //steppedLine: true,
		    //howLine: false,
		    pointStyle: 'line',
		    pointHoverRadius: 5,
		    pointHoverBackgroundColor: "rgba(0, 255, 0,1)",
		    pointHoverBorderColor: "rgba(0, 255, 0,1)",
		    pointHoverBorderWidth: 4,
		    backgroundColor: 'rgba(0, 255, 0, 0.5)',
		    borderColor: 'rgba(0, 255, 0, 1)',
		    borderWidth: 2
		  });
	  if (pubkey1WasMember)
	  {
	    datasets.push({
		    label: LANG["LEGEND_DU_LINE"]+' ('+((unit == "relative") ? LANG["UNIT_R"]:LANG["UNIT_Q"])+')',
		    data: tabDividend,
		    fill: false,
		    pointStyle: 'triangle',
		    backgroundColor: 'rgba(0, 255, 0, 0.5)',
		    borderColor: 'rgba(0, 255, 0, 1)',
		    borderWidth: 1,
		    hoverBackgroundColor: 'rgba(0, 255, 0, 0.2)',
		    hoverborderColor: 'rgba(0, 255, 0, 0.2)'
		  });
	    datasets.push({
		    label: LANG["LEGEND_TX_BALANCE"]+' ('+((unit == "relative") ? LANG["UNIT_R"]:LANG["UNIT_Q"])+')',
		    data: tabTxBalance,
		    fill: false,
		    backgroundColor: 'rgba(0, 0, 0, 0.5)',
		    borderColor: 'rgba(0, 0, 0, 1)',
		    borderWidth: 1,
		    hoverBackgroundColor: 'rgba(0, 0, 0, 0.2)',
		    hoverborderColor: 'rgba(0, 0, 0, 0.2)'
		  });
	  }
	}
	else if (mode == 'balanceWithOthers')
	{
	  datasets.push({
		  label: `${unit == "relative" ? "DUğ1" : 'ğ1'}`,
		  data: tabBalanceWithOthersOrdered,
		  backgroundColor: colorScale(tabBalanceWithOthersOrdered.length, 0.5),
		  borderColor: colorScale(tabBalanceWithOthersOrdered.length, 1),
		  borderWidth: 1,
		  hoverBackgroundColor: colorScale(tabBalanceWithOthersOrdered.length, 0.2),
		  hoverborderColor: colorScale(tabBalanceWithOthersOrdered.length, 0.2)
		  });
	}
      }
      res.locals = {
	 host: req.headers.host.toString(),
         begin: cache.beginBlock[0].number, 
         end: cache.endBlock[0].number,
	 pubkey1,
	 description: `${LANG["DESCRIPTION"]}`,
	 chart: {
	    type: (mode == "selfBalance") ? 'line':'bar',
	    data: {
	      labels: (mode == "selfBalance") ? tabTimes:tabIndexOthersOrdered,
	      datasets: datasets
	    },
	    options: {
	      title: {
		display: (mode == "selfBalance") ? true:false,
		text: (pubkey1.length > 0) ? LANG["CHART_TITLE1"]+' '+( (pubkey1WasMember) ? idtyPubkey1[0].uid:pubkey1 )+' '+LANG["CHART_TITLE2"]+' #'+cache.beginBlock[0].number+'-#'+cache.endBlock[0].number:''
	      },
	      legend: {
		display: (mode == "selfBalance") ? true:false,
	      },
	      scales: {
		yAxes: [{
		  ticks: {
		      beginAtZero: true,
		  }
		}]
	      }
	    }
	  },
	  form: `${LANG["BEGIN"]} #<input type="number" name="begin" value="${cache.beginBlock[0].number}" size="7" style="width:60px;" min="0"  ${(mode == "balanceWithOthers") ? 'disabled':''}>
	     - ${LANG["END"]} #<input type="number" name="end" value="${cache.endBlock[0].number}" size="7" style="width:60px;" min="1"  ${(mode == "balanceWithOthers") ? 'disabled':''}>
	     - ${LANG["PUBKEY"]} : <input type="text" name="pubkey1" value="${pubkey1}" size="44">
	    <select name="mode" disabled>
	      <option name="mode" value ="selfBalance">${LANG["SELECT_MODE1"]}
	      <option name="mode" value ="balanceWithOthers" ${mode == 'balanceWithOthers' ? 'selected' : ''}>${LANG["SELECT_MODE2"]}
	    </select>
	    <select name="unit">
	      <option name="unit" value ="quantitative">${LANG["UNIT_Q"]}
	      <option name="unit" value ="relative" ${unit == 'relative' ? 'selected' : ''}>${LANG["UNIT_R"]}
	    </select>
	     - step <input type="number" name="step" value="${cache.step}" size="3" style="width:50px;" min="1"  ${(mode == "balanceWithOthers") ? 'disabled':''}>
	     <select name="stepUnit" ${(mode == "balanceWithOthers") ? 'disabled':''}>
	      <option name="stepUnit" value ="hours"${cache.stepUnit == 'hours' ? 'selected' : ''}>${LANG["HOURS"]}
	      <option name="stepUnit" value ="days" ${cache.stepUnit == 'days' ? 'selected' : ''}>${LANG["DAYS"]}
	      <option name="stepUnit" value ="weeks" ${cache.stepUnit == 'weeks' ? 'selected' : ''}>${LANG["WEEKS"]}
	      <option name="stepUnit" value ="months" ${cache.stepUnit == 'months' ? 'selected' : ''}>${LANG["MONTHS"]}
	      <option name="stepUnit" value ="years" ${cache.stepUnit == 'years' ? 'selected' : ''}>${LANG["YEARS"]}
	    </select>`
      }
      next()
    }
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
  }
})

