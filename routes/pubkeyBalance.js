"use strict";

const co = require('co')
const timestampToDatetime = require('../lib/timestampToDatetime')
const getLang = require('../lib/getLang')

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow } = req.app.locals
  
  try {
    // get GET parameters
    var begin = req.query.begin >= 0 && req.query.begin || 0; // Default begin Value is zero
    var end = req.query.end || -1; // Default Value is -1 (=current block)
    var format = req.query.format || 'HTML';
    var pubkey1 = req.query.pubkey1 || 'D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx';
    var mode = /*req.query.mode == 'balanceWithOthers' ? 'balanceWithOthers' :*/ 'selfBalance';
    var unit = req.query.unit == 'relative' ? 'relative' : 'quantitative';
    var step = req.query.step || 1;
    var unitStep = req.query.stepUnit || 'days';
    var meanCurrencyMass = (req.query.meanCurrencyMass == 'no') ? 'no':'yes';
    var showDividend = (req.query.showDividend == 'no') ? 'no':'yes';
    var onlyTxBalance = (req.query.onlyTxBalance == 'yes') ? 'yes':'no';
    
    // In balanceWithOthers mode, disable options : meanCurrencyMass, showDividend and onlyTxBalance
    if (mode == "balanceWithOthers")
    {
      meanCurrencyMass = "no";
      showDividend = "no";
      onlyTxBalance = "no";
    }
    
    // get medianTime of beginBlock and endBlock
    if (begin >= 0)
    {
      var beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`hash` FROM block WHERE `fork`=0 AND `number` = '+begin+' LIMIT 1');
      if (beginBlock.length <= 0)
      {
	res.status(500).send('<pre>Error : begin parameter is to high !</pre>');
      }
    }
    else
    {
      res.status(500).send('<pre>Error : begin parameter must be positive !</pre>');
    }
    if (end >= 0)
    {
      if (end >= begin)
      {
	var endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`hash` FROM block WHERE `fork`=0 AND `number` = '+end+' LIMIT 1');
	if (endBlock.length <= 0) { end = -1; }
      }
      else
      {
	res.status(500).send('<pre>Error : end parameter must be >= begin !</pre>');
      }
    }
    else
    {
      var endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`number`,`hash`,`membersCount`,`monetaryMass` FROM block ORDER BY `medianTime` DESC LIMIT 1 ');
      end = endBlock[0].number;
    }
    
    // get issuers and recipients for all txs
    let txsIssuersRecipients = [];
    txsIssuersRecipients = yield duniterServer.dal.peerDAL.query('SELECT `hash`,`issuers`,`recipients` FROM txs WHERE `time` >= '+beginBlock[0].medianTime+' AND `time` <= '+endBlock[0].medianTime);
    
    // get list of txs with pubkey1
    var pubkey1TxsHashs = [];
    if (mode == "balanceWithOthers") { var tabindexOthersKeys = new Array(); }
    for (let i=0;i<txsIssuersRecipients.length;i++)
    {
      let currentIssuers = JSON.parse(txsIssuersRecipients[i].issuers);
      let currentRecipients = JSON.parse(txsIssuersRecipients[i].recipients);
      
      // Determine if pubkey1IsIssuer
      let pubkey1IsIssuer = false;
      for (let j=0;j<currentIssuers.length;j++) { if (currentIssuers[j] == pubkey1) { pubkey1IsIssuer = true; j= currentIssuers.length; } }
      
      // Determine if pubkey1IsRecipient
      let pubkey1IsRecipient = false;
      for (let j=0;j<currentRecipients.length;j++) { if (currentRecipients[j] == pubkey1) { pubkey1IsRecipient = true; j= currentRecipients.length; } }
      
      // If pubkey1 is issuer or recipient, push tx into tab pubkey1TxsHashs
      if (pubkey1IsIssuer || pubkey1IsRecipient)
      {
	  pubkey1TxsHashs.push({
	      hash: txsIssuersRecipients[i].hash,
	      pubkey1IsIssuer: pubkey1IsIssuer,
	      pubkey1IsRecipient: pubkey1IsRecipient
	  });
      }
      
      // In mode "balanceWithOthers", collected pubkeys that exchanges with pubkey1
      if (mode == "balanceWithOthers")
      {
	if (pubkey1IsRecipient && mode == "balanceWithOthers")
	{
	  for (let j=0;j<currentIssuers.length;j++)
	  {
	    let issuerFirstTime = true;
	    for (let k=0;k<tabindexOthersKeys.length;k++) { if (tabindexOthersKeys[k] == currentIssuers[j]) { issuerFirstTime = false; k=tabindexOthersKeys.length; } }
	    if (issuerFirstTime == true && currentIssuers[j] != pubkey1) { tabindexOthersKeys.push(currentIssuers[j]); }
	  }
	}
	if (pubkey1IsIssuer && mode == "balanceWithOthers")
	{
	  for (let j=0;j<currentRecipients.length;j++)
	  { 
	    let RecipientFirstTime = true;
	    for (let k=0;k<tabindexOthersKeys.length;k++) { if (tabindexOthersKeys[k] == currentRecipients[j]) { RecipientFirstTime = false; k=tabindexOthersKeys.length; } }
	    if (RecipientFirstTime == true && currentRecipients[j] != pubkey1) { tabindexOthersKeys.push(currentRecipients[j]); }
	  }
	}
      }
    }
    
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
      var pubkey1Dividends = yield duniterServer.dal.peerDAL.query('SELECT `dividend`,`medianTime` FROM block WHERE `fork`=0 AND `dividend` > 0 '
        +'AND `medianTime` >=\''+joinersTimePubkey1[0].medianTime+'\' AND `medianTime` >=\''+beginBlock[0].medianTime+'\' AND `medianTime` <=\''+endBlock[0].medianTime+'\' '
	+'ORDER BY `medianTime` ASC');
    }
    // If pubkey1 was no-member, force showDividend to "no"
    else { showDividend = "no"; }
    
    // get currentDividend
    var currentDividend = yield duniterServer.dal.peerDAL.query('SELECT `dividend` FROM block WHERE `fork`=0 AND `dividend` > 0 ORDER BY `medianTime` DESC LIMIT 1');
    
    // Initialize tabBalance
    var tabBalance = [];
    
    // If mode is "balanceWithOthers", initialize tabindexOthersMembers and full tabBalance with zero
    if (mode == "balanceWithOthers")
    {
      var tabindexOthersMembers = new Array();
      for (let i=0;i<tabindexOthersKeys.length;i++)
      {
	tabBalance.push(0);
	let member = yield duniterServer.dal.peerDAL.query('SELECT `uid` FROM i_index WHERE `pub`=\''+tabindexOthersKeys[i]+'\' AND `wasMember`=1 LIMIT 1');
	if (member.length > 0) { tabindexOthersMembers.push(member[0].uid); }
	else { tabindexOthersMembers.push(tabindexOthersKeys[i]); }
      }
    }
    
    // Initialize nextStepTime, pubkey1TotalBalance and idDividend
    var nextStepTime = beginBlock[0].medianTime;
    var pubkey1TotalBalance = 0;
    var idDividend = 0;
    
    // Initialize tabDividend and pubkey1Dividend
    if (showDividend == "yes") { var tabDividend = [];  var pubkey1Dividend = 0; }
    
    // pubkey1 txs loop
    var tabTimes = [];
    if (meanCurrencyMass == "yes") { var tabMeanCurrencyMass = []; }
    if (format == 'JSON') { var tabJson = []; }
    var stepTxsBlocks = [];
    for (let t=0;t<pubkey1TxsHashs.length;t++)
    {
      let pubkey1TxBalance = 0;
      
      // get tx data
      let tx = [];
      if (mode == "balanceWithOthers")
      {
	tx = yield duniterServer.dal.peerDAL.query('SELECT `time`,`block_number`,`inputs`,`outputs`,`issuers`,`recipients` FROM txs WHERE `hash` >= \''+pubkey1TxsHashs[t].hash+'\' LIMIT 1');
      }
      else
      {
        tx = yield duniterServer.dal.peerDAL.query('SELECT `time`,`block_number`,`inputs`,`outputs` FROM txs WHERE `hash` >= \''+pubkey1TxsHashs[t].hash+'\' LIMIT 1');
      }
      
      // push tx.block_number
      stepTxsBlocks.push(tx[0].block_number);
      
      if (pubkey1TxsHashs[t].pubkey1IsIssuer)
      {
	// selfBalance inputs traitment
	if (mode == "selfBalance")
	{
	  // parse inputs
	  let inputs = JSON.parse(tx[0].inputs);
	  // sum pubkey1 inputs (in negative)
	  for (let i=0;i<inputs.length;i++)
	  {
	    inputs[i] = inputs[i].split(":");
	    pubkey1TxBalance -= parseInt(inputs[i][0]);
	  }
	}
	// balanceWithOthers outputs traitment
	else
	{
	  // parse recipients and outputs
	  let outputs = JSON.parse(tx[0].outputs);
	  
	  // outputs traitment
	  for (let o=0;o<outputs.length;o++)
	  {
	    // split outputs
	    outputs[o] = outputs[o].split(":");
	  
	    // find recipientIndex
	    let recipientIndex=0;
	    for (let i=0;i<tabindexOthersKeys.length;i++) { if (outputs[o][2] == ("SIG("+tabindexOthersKeys[i]+")")) { recipientIndex=i; i=tabindexOthersKeys.length; } }
	    
	    // add output to recipientIndex balance
	    tabBalance[recipientIndex] += parseInt(outputs[o][0]);
	  }
	}
      }
      else if (mode == "balanceWithOthers")
      {
	// parse inputs and issuers
	let inputs = JSON.parse(tx[0].inputs);
	let issuers = JSON.parse(tx[0].issuers);
	
	// find issuerIndex
	  let issuerIndex=0;
	  for (let i=0;i<tabindexOthersKeys.length;i++) { if (tabindexOthersKeys[i] == issuers[0]) { issuerIndex=i; i=tabindexOthersKeys.length; } }
	  
	  // delete inputs to issuerIndex
	  for (let i=0;i<inputs.length;i++)
	  {
	    inputs[i] = inputs[i].split(":");
	    tabBalance[issuerIndex] -= parseInt(inputs[i][0]);
	  }
      }
      
      if (mode == "selfBalance")
      {
	// selfBalance outputs traitment
	if (pubkey1TxsHashs[t].pubkey1IsRecipient)
	{
	  // parse outputs
	  let outputs = JSON.parse(tx[0].outputs);
	  // sum pubkey1 outputs
	  for (let o=0;o<outputs.length;o++)
	  {
	    outputs[o] = outputs[o].split(":");
	    if ( outputs[o][2] == ("SIG("+pubkey1+")") ) { pubkey1TxBalance += parseInt(outputs[o][0]); }
	  }
	}
      
	// Force push of the latest Tx
	if ( (t+1) == pubkey1TxsHashs.length)
	{
	  pubkey1TotalBalance += pubkey1TxBalance;
	  tx[0].time = nextStepTime;
	}
      
	// if tx.time achieve nextStepTime, push tx and dividends in tabs
	if (tx[0].time >= nextStepTime)
	{
	  // push dividend to pubkey1TotalBalance until nextStepTime
	  if (pubkey1WasMember)
	  {
	    while (idDividend < pubkey1Dividends.length && pubkey1Dividends[idDividend].medianTime < nextStepTime)
	    {
	      if (onlyTxBalance  == "no") { pubkey1TotalBalance += pubkey1Dividends[idDividend].dividend; }
	      if (showDividend == "yes") { pubkey1Dividend += pubkey1Dividends[idDividend].dividend; }
	      idDividend++;
	    }
	  }
	  
	  // Calculate meanCurrencyMass and push tabMeanCurrencyMass
	  if (meanCurrencyMass == "yes")
	  {
	    let block = yield duniterServer.dal.peerDAL.query('SELECT `membersCount`,`monetaryMass` FROM block WHERE `fork`=0 AND `medianTime` > \''+nextStepTime+'\' ORDER BY `medianTime` ASC LIMIT 1');
	    if ( typeof(block[0]) == 'undefined') { block = endBlock; }
	    if (unit == 'relative') { tabMeanCurrencyMass.push( (block[0].monetaryMass/(block[0].membersCount*currentDividend[0].dividend)).toFixed(2) ) }
	    else { tabMeanCurrencyMass.push( (block[0].monetaryMass/(block[0].membersCount*100)).toFixed(2) ); }
	  }
	  
	  // push tabBalance for chart data
	  if (mode == "selfBalance")
	  {
	    if (unit == 'relative')
	    {
	      tabBalance.push( ((pubkey1TotalBalance) / (currentDividend[0].dividend)).toFixed(2) );
	      if (showDividend == "yes") { tabDividend.push( ((pubkey1Dividend) / (currentDividend[0].dividend)).toFixed(2)); }
	    }
	    else
	    {
	      tabBalance.push((pubkey1TotalBalance/100).toFixed(2));
	      if (showDividend == "yes") { tabDividend.push( (pubkey1Dividend/100).toFixed(2) ); }
	    }
	  }
	    
	  // push tabTimes for chart xAxes label
	  tabTimes.push(timestampToDatetime(nextStepTime));
	  
	  // push tabJson
	  if (format == 'JSON')
	  {
	    if (mode == "selfBalance")
	    {
	      tabJson.push({
		totalBalance: (onlyTxBalance == "no") ? pubkey1TotalBalance:"-",
		dividendBalance: (showDividend == "yes") ? pubkey1Dividend:"-",
		txbalance: (onlyTxBalance == "yes") ? pubkey1TotalBalance:"-",
		meanCurrencyMass: (meanCurrencyMass == "yes") ? tabMeanCurrencyMass[tabMeanCurrencyMass.length-1]:"-",
		time: tabTimes[tabTimes.length-1],
		txsBlocks: stepTxsBlocks.splice(0, stepTxsBlocks.length)
	      });
	    }
	  }
	  
	  // calculate next nextStepTime
	  switch (unitStep)
	  {
	    case "hours": nextStepTime += step*3600; break;
	    case "days": nextStepTime += step*86400; break;
	    case "weeks": nextStepTime += step*604800; break;
	    case "months": nextStepTime += step*18144000; break;
	    case "years": nextStepTime += step*31557600; break;
	  }
	  
	  // limit nextStepTime
	  if (nextStepTime > endBlock[0].medianTime) { nextStepTime = endBlock[0].medianTime; }
	}

	// Push TxBalance to pubkey1TotalBalance
	pubkey1TotalBalance += pubkey1TxBalance;
      }
    }
    
    if (format == 'JSON')
    {
      if (mode == 'balanceWithOthers')
      {
	for(let i=0;i<tabindexOthersKeys.length;i++)
	{
	  tabJson.push({
		  pubkey: tabindexOthersMembers[i],
		  balance: tabBalance[i]
		});
	}
      }
      res.status(200).jsonp( tabJson )
    }
    else
    {
      var LANG = getLang(`./lg/pubkeyBalance_${req.query.lg||'fr'}.txt`);
      var datasets = new Array();
      if (mode == "selfBalance")
      {
	datasets.push({
		  label: `${unit == "relative" ? "DUğ1" : 'ğ1'}`,
		  data: tabBalance,
		  fill: false,
		  backgroundColor: 'rgba(0, 162, 245, 0.5)',
		  borderColor: 'rgba(0, 162, 245, 1)',
		  borderWidth: 1,
		  hoverBackgroundColor: 'rgba(0, 162, 245, 0.2)',
		  hoverborderColor: 'rgba(0, 162, 245, 0.2)'
		});
	if (meanCurrencyMass == "yes")
	{
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
	}
	if (showDividend == "yes")
	{
	  datasets.push({
		  label: idtyPubkey1[0].uid+' '+LANG["LEGEND_DU_LINE"]+' ('+((unit == "relative") ? LANG["UNIT_R"]:LANG["UNIT_Q"])+')',
		  data: tabDividend,
		  fill: false,
		  backgroundColor: 'rgba(0, 255, 0, 0.5)',
		  borderColor: 'rgba(0, 255, 0, 1)',
		  borderWidth: 1,
		  hoverBackgroundColor: 'rgba(0, 255, 0, 0.2)',
		  hoverborderColor: 'rgba(0, 255, 0, 0.2)'
		});
	}
      }
      else if (mode == 'balanceWithOthers')
      {
	datasets.push({
		label: `${unit == "relative" ? "DUğ1" : 'ğ1'}`,
		data: tabBalance,
		backgroundColor: 'rgba(0, 255, 0, 0.5)',
		borderColor: 'rgba(0, 255, 0, 1)',
		borderWidth: 1,
		hoverBackgroundColor: 'rgba(0, 255, 0, 0.2)',
		hoverborderColor: 'rgba(0, 255, 0, 0.2)'
		});
      }
      
      res.locals = {
         begin, 
         end,
	 pubkey1,
	 meanCurrencyMass,
	 description: `${LANG["DESCRIPTION"]}`,
	 chart: {
	    type: (mode == "selfBalance") ? 'line':'bar',
	    data: {
	      labels: (mode == "selfBalance") ? tabTimes:tabindexOthersMembers,
	      datasets: datasets
	    },
	    options: {
	      title: {
		display: (mode == "selfBalance") ? true:false,
		text: `${LANG["CHART_TITLE1"]+' '+pubkey1+' '+LANG["CHART_TITLE2"]+' #'+begin+'-#'+end}`
	      },
	      legend: {
		display: true
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
	  form: `${LANG["BEGIN"]} #<input type="number" name="begin" value="${begin}" size="7" style="width:60px;" min="0">
	     - ${LANG["END"]} #<input type="number" name="end" value="${end}" size="7" style="width:60px;" min="1">
	     - ${LANG["PUBKEY"]} : <input type="text" name="pubkey1" value="${pubkey1}" size="44">
	    <select name="mode" disabled>
	      <option name="mode" value ="selfBalance">${LANG["SELECT_MODE1"]}
	      <option name="mode" value ="balanceWithOthers" ${mode == 'balanceWithOthers' ? 'selected' : ''}>${LANG["SELECT_MODE2"]}
	    </select>
	    <select name="unit">
	      <option name="unit" value ="quantitative">${LANG["UNIT_Q"]}
	      <option name="unit" value ="relative" ${unit == 'relative' ? 'selected' : ''}>${LANG["UNIT_R"]}
	    </select>
	     - step <input type="number" name="step" value="${step}" size="3" style="width:50px;" min="1">
	     <select name="stepUnit">
	      <option name="stepUnit" value ="hours"${unitStep == 'hours' ? 'selected' : ''}>${LANG["HOURS"]}
	      <option name="stepUnit" value ="days" ${unitStep == 'days' ? 'selected' : ''}>${LANG["DAYS"]}
	      <option name="stepUnit" value ="weeks" ${unitStep == 'weeks' ? 'selected' : ''}>${LANG["WEEKS"]}
	      <option name="stepUnit" value ="months" ${unitStep == 'months' ? 'selected' : ''}>${LANG["MONTHS"]}
	      <option name="stepUnit" value ="years" ${unitStep == 'years' ? 'selected' : ''}>${LANG["YEARS"]}
	    </select>`,
	    form2: `<input type="checkbox" name="meanCurrencyMass" value="yes" ${meanCurrencyMass == 'yes' ? 'checked' : ''}> ${LANG["CHECKBOX_MEAN_M"]}
	    <input type="checkbox" name="showDividend" value="yes" ${showDividend == 'yes' ? 'checked' : ''}> ${LANG["CHECKBOX_SHOW_DU"]}
	    <input type="checkbox" name="onlyTxBalance" value="yes" ${onlyTxBalance == 'yes' ? 'checked' : ''}> ${LANG["CHECKBOX_ONLY_TX"]}`
      }
      next()
    }
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
  }
})

