"use strict";

const co = require('co');

const STEP_COUNT_MIN = 4;
const STEP_COUNT_MAX = 150;

/**
     * updateCache
     * 
     */
module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow, sigQty, stepMax, cache } = req.app.locals

  try {
    // If fork, unstack cache
    if (cache.endBlock != null)
    {
      let currentBlock = yield duniterServer.dal.peerDAL.query('SELECT `hash` FROM block WHERE `fork`=0 AND `number`='+cache.endBlock[0].number+' LIMIT 1 ');
      if (cache.blockchain.length > 0 && cache.blockchain[cache.blockchain.length-1].hash != currentBlock[0].hash)
      {
	console.log("unstack block #%s", cache.blockchain.length);
	// unstack loop
	while (cache.blockchain.length > 0  && cache.blockchain[cache.blockchain.length-1].hash != currentBlock[0].hash)
	{
	  // unstack cache.blockchain
	  cache.blockchain.pop();
	  
	  // unstack block
	  currentBlock = yield duniterServer.dal.peerDAL.query('SELECT `hash` FROM block WHERE `fork`=0 AND `number`='+cache.blockchain.length+' LIMIT 1 ');
	}
	
	if (cache.blockchain.length > 0 )
	{
	  // unstak pubkeys joins during the fork (no-member pubkeys has considered join when then received currency for the first time)
	  while (cache.pubkeys[cache.pubkeys.length-1].join >= cache.blockchain.length) { cache.pubkeys.pop(); cache.pub_index.pop(); }

	  // unstak transactions and certifications written during the fork
	  for (let m=0;cache.pubkeys.length;m++)
	  {
	    // unstak inputs
	    while (cache.pubkeys[m].inputsTime[cache.pubkeys[m].inputsTime.length-1] > cache.blockchain[cache.blockchain.length-1].medianTime)
	    {
	      cache.pubkeys[m].inputsTime.pop();
	      cache.pubkeys[m].inputsAmount.pop();
	    }
	    // unstak outputs
	    while (cache.pubkeys[m].outputsTime[cache.pubkeys[m].outputsTime.length-1] > cache.blockchain[cache.blockchain.length-1].medianTime)
	    {
	      cache.pubkeys[m].outputsTime.pop();
	      cache.pubkeys[m].outputsAmount.pop();
	    }
	    // unstak certs
	    while (cache.pubkeys[m].writtenCerts[cache.pubkeys[m].writtenCerts.length-1] > cache.blockchain.length) { cache.pubkeys[m].writtenCerts.pop(); }
	    while (cache.pubkeys[m].receivedCerts[cache.pubkeys[m].receivedCerts.length-1] > cache.blockchain.length) { cache.pubkeys[m].receivedCerts.pop(); }
	  }
	}
	else
	{
	  cache.endBlock = null;
	  cache.Yn = 0;
	  cache.pubkeys.splice(0, cache.pubkeys.length);
	  cache.pub_index.splice(0, cache.pub_index.length);
	}
      }
    }
    
    // define step
    cache.step = 1;
    if (typeof(req.query.step) != 'undefined' && parseInt(req.query.step) > 0) { cache.step = req.query.step; }
    
    // calculate unitTime and onlyDate
    let unitTime = 0;
    if (typeof(req.query.stepUnit) != 'undefined')
    {
      switch (req.query.stepUnit)
      {
	  case "blocks": unitTime = 3600; cache.onlyDate = false; cache.stepUnit = "blocks"; break;
	  case "hours": unitTime = 3600; cache.onlyDate = false; cache.stepUnit = "hours"; break;
	  case "days": unitTime = 86400; cache.onlyDate = false; cache.stepUnit = "days"; break;
	  case "weeks": unitTime = 604800; cache.onlyDate = true; cache.stepUnit = "weeks"; break;
	  case "months": unitTime = 18144000; cache.onlyDate = true; cache.stepUnit = "months"; break;
	  case "years": unitTime = 31557600; cache.onlyDate = true; cache.stepUnit = "years"; break;
      }
    }
    // Default values
    else
    {
      unitTime = 86400; cache.onlyDate = false; cache.stepUnit = "days";
    }
    
    // get endBlock
    if ( typeof(req.query.end) == 'undefined' || req.query.end < 0)
    {
      cache.endBlock = yield duniterServer.dal.peerDAL.query('SELECT `hash`,`medianTime`,`number`,`membersCount` FROM block WHERE `fork`=0 ORDER BY `medianTime` DESC LIMIT 1 ');
    }
    else
    {
      cache.endBlock = yield duniterServer.dal.peerDAL.query('SELECT `hash`,`medianTime`,`number`,`membersCount` FROM block WHERE `fork`=0 AND `number`='+req.query.end+' LIMIT 1 ');
      // Si end >= currentBlock, get currentBlock
      if ( typeof(cache.endBlock[0]) == 'undefined' )
      {
	cache.endBlock = yield duniterServer.dal.peerDAL.query('SELECT `hash`,`medianTime`,`number`,`membersCount` FROM block WHERE `fork`=0 ORDER BY `medianTime` DESC LIMIT 1 ');
      }
    }
    
    // fix begin value
    if ( typeof(req.query.begin) == 'undefined' || req.query.begin < 0 )
    { cache.beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`number` FROM block WHERE `fork`=0 AND `number`=0 LIMIT 1 '); }
    else if (req.query.begin > cache.endBlock[0].number)
    {
      let beginTime = cache.endBlock[0].medianTime-(parseInt(cache.step)*unitTime*STEP_COUNT_MIN);
      cache.beginBlock =  yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`number` FROM block WHERE `fork`=0 AND `medianTime` >= \''+beginTime+'\' ORDER BY `medianTime` ASC LIMIT 1 ');
    }
    else { cache.beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`number` FROM block WHERE `fork`=0 AND `number`='+req.query.begin+' LIMIT 1 '); }
    
    // Apply STEP_COUNT_MAX and calculate stepTime
    if ( Math.ceil((cache.endBlock[0].medianTime-cache.beginBlock[0].medianTime)/(cache.step*unitTime)) > STEP_COUNT_MAX  )
    { cache.step = Math.ceil((cache.endBlock[0].medianTime-cache.beginBlock[0].medianTime)/(STEP_COUNT_MAX*unitTime)); }
    cache.stepTime = parseInt(cache.step)*unitTime;

    // if new blocks, update cache
    if ( parseInt(cache.endBlock[0].number) >= cache.blockchain.length )
    {
      let previousCacheTime = (cache.blockchain.length > 0) ? cache.blockchain[cache.blockchain.length-1].medianTime:0;
      var newBlocks = yield duniterServer.dal.peerDAL.query(
	'SELECT `hash`,`membersCount`,`medianTime`,`number`,`dividend`,`transactions`,`joiners`,`certifications`,`issuersCount` FROM block WHERE `fork`=0 AND `medianTime` > '+previousCacheTime+' AND `medianTime` <= '+cache.endBlock[0].medianTime+' ORDER BY `medianTime` ASC');
      
      if ( cache.blockchain.length > 0 && (newBlocks.length-1) != (parseInt(cache.endBlock[0].number)-cache.blockchain.length) )
      {
	res.status(500).send('<pre>Fatal Error : newBlocks.length != (endBlock[0].number-cache.blockchain.length)</pre>');
      }
      
      for (let b=0;b<newBlocks.length;b++)
      {
	// Init let variables
	let newSentries=0;
	let transactions = [];
	let joiners = [];
	let certifications = [];
	
	// If Yn change, suppr sentries that not achieve new Yn value
	let newYn = Math.ceil(Math.pow(cache.endBlock[0].membersCount, 1/stepMax));
	if (newYn > cache.Yn)
	{
	  for (let m=0;m<cache.pubkeys.length;m++)
	  {
	    if (cache.pubkeys[m].writtenCerts.length >= cache.Yn && cache.pubkeys[m].receivedCerts.length >= cache.Yn && cache.pubkeys[m].writtenCerts.length < newYn && cache.pubkeys[m].receivedCerts.length < newYn) { newSentries -= 1; }
	  }
	}
	cache.Yn = newYn;
	
	// add dividend to members balance
	if (parseInt(newBlocks[b].dividend) > 0)
	{
	  for (let k=0;k<cache.pubkeys.length;k++)
	  {
	    if ( cache.pubkeys[k].receivedCerts != null && cache.pubkeys[k].receivedCerts.length >= sigQty)
	    { cache.pubkeys[k].balance += parseInt(newBlocks[b].dividend); }
	  }
	}
	
	// parse and push transactions
	transactions = JSON.parse(newBlocks[b].transactions);
	for (let t=0;t<transactions.length;t++)
	{
	  // Calculate inputsSum
	  let inputsSum = 0;
	  for (let i=0;i<transactions[t].inputs.length;i++)
	  {
	    let input = transactions[t].inputs[i].split(":");
	    inputsSum += (parseInt(input[0])*Math.pow(10, parseInt(input[1])));
	  }
	  
	  // get issuer
	  let issuer = transactions[t].issuers[0];
	  
	  // Push issuer inputs
	  if (typeof(cache.pub_index[issuer]) == 'undefined')
	  {
	    cache.pubkeys.push({
		join: cache.blockchain.length+1,
		pub: issuer,
		balance: inputsSum,
		inputsTime: new Array(parseInt(newBlocks[b].medianTime)),
		inputsAmount: new Array(inputsSum),
		outputsTime: new Array(),
		outputsAmount: new Array(),
		writtenCerts: null, // tab of blocks number (only for members pubkeys)
		receivedCerts: null // tab of blocks number (only for members pubkeys)
	      });
	      cache.pub_index[issuer] = cache.pubkeys.length-1;
	      //console.log("w : issuer first : cache.pub_index[%s] = %s", issuer, cache.pub_index[issuer]); // DEBUG
	  }
	  else
	  {
	    let pubkeyId = cache.pub_index[issuer];
	    if (cache.pubkeys[pubkeyId].inputsTime[cache.pubkeys[pubkeyId].inputsTime.length-1] == parseInt(newBlocks[b].medianTime))
	    {
	      cache.pubkeys[pubkeyId].inputsAmount[cache.pubkeys[pubkeyId].inputsAmount.length-1] += inputsSum;
	      cache.pubkeys[pubkeyId].balance -= inputsSum;
	    }
	    else
	    {
	      //console.log("cache.pubkeys[%s] = %s", pubkeyId, cache.pubkeys[pubkeyId].pub); // DEBUG
	      cache.pubkeys[pubkeyId].inputsTime.push(parseInt(newBlocks[b].medianTime));
	      cache.pubkeys[pubkeyId].inputsAmount.push(inputsSum);
	      cache.pubkeys[pubkeyId].balance -= inputsSum;
	    }
	  }
	    
	  // split and push outputs 
	  for (let o=0;o<transactions[t].outputs.length;o++)
	  {
	    let output = transactions[t].outputs[o].split(":");
	    let ouputAmout = parseInt(output[0])*Math.pow(10, parseInt(output[1]));
	    
	    // get receiver pubkey
	    let pubkey = output[2].substr(4, output[2].length-5);
	    
	    if (typeof(cache.pub_index[pubkey]) == 'undefined')
	    {
	      cache.pubkeys.push({
		join: cache.blockchain.length+1,
		pub: pubkey,
		balance: ouputAmout,
		inputsTime: new Array(),
		inputsAmount: new Array(),
		outputsTime: new Array(),
		outputsAmount: new Array(),
		writtenCerts: null, // tab of blocks number (only for members pubkeys)
		receivedCerts: null // tab of blocks number (only for members pubkeys)
	      });
	      cache.pub_index[pubkey] = cache.pubkeys.length-1;
	      cache.pubkeys[cache.pubkeys.length-1].outputsTime.push(parseInt(newBlocks[b].medianTime));
	      cache.pubkeys[cache.pubkeys.length-1].outputsAmount.push(ouputAmout);
	    }
	    else
	    {
	      let pubkeyId = cache.pub_index[pubkey];
	      cache.pubkeys[pubkeyId].balance += ouputAmout;
	      if (pubkey == issuer)
	      {
		cache.pubkeys[pubkeyId].inputsAmount[cache.pubkeys[pubkeyId].inputsAmount.length-1] -= ouputAmout;
		ouputAmout = 0;
	      }
	      
	      if (cache.pubkeys[pubkeyId].outputsTime[cache.pubkeys[pubkeyId].outputsTime.length-1] == parseInt(newBlocks[b].medianTime))
	      {
		cache.pubkeys[pubkeyId].outputsAmount[cache.pubkeys[pubkeyId].outputsAmount.length-1] += ouputAmout;
	      }
	      else
	      {
		cache.pubkeys[pubkeyId].outputsTime.push(parseInt(newBlocks[b].medianTime));
		cache.pubkeys[pubkeyId].outputsAmount.push(ouputAmout);
	      }
	    }
	    
	    // If receiver pubkey balance <= 1,00, destroy money
	    if ( cache.pubkeys[cache.pub_index[pubkey]].balance < 100)
	    {
	      cache.destroyAmount += cache.pubkeys[cache.pub_index[pubkey]].balance;
	      cache.pubkeys[cache.pub_index[pubkey]].outputsAmount[cache.pubkeys[cache.pub_index[pubkey]].outputsAmount.length-1] -= cache.pubkeys[cache.pub_index[pubkey]].balance;
	      cache.pubkeys[cache.pub_index[pubkey]].balance = 0;
	    }
	  }
	  
	  // If issuer pubkey balance <= 1,00, destroy money
	  if ( cache.pubkeys[cache.pub_index[issuer]].balance < 100)
	  {
	    cache.destroyAmount += cache.pubkeys[cache.pub_index[issuer]].balance;
	    cache.pubkeys[cache.pub_index[issuer]].inputsAmount[cache.pubkeys[cache.pub_index[issuer]].inputsAmount.length-1] += cache.pubkeys[cache.pub_index[issuer]].balance;
	    cache.pubkeys[cache.pub_index[issuer]].balance = 0;
	  }
	}
	
	// parse and split joiners
	joiners = JSON.parse(newBlocks[b].joiners);
	for (let j=0;j<joiners.length;j++)
	{
	  joiners[j] = joiners[j].split(":");
	  if ( typeof(cache.pub_index[joiners[j][0]]) != 'undefined') 
	  {
	    let pubkeyId = cache.pub_index[joiners[j][0]];
	    cache.pubkeys[pubkeyId].writtenCerts = new Array();
	    cache.pubkeys[pubkeyId].receivedCerts = new Array();
	  }
	  else
	  {
	    cache.pubkeys.push({
	      join: cache.blockchain.length+1,
	      pub: joiners[j][0],
	      balance: 0,
	      inputsTime: new Array(),
	      inputsAmount: new Array(),
	      outputsTime: new Array(),
	      outputsAmount: new Array(),
	      writtenCerts: new Array(), // tab of blocks number (only for members pubkeys)
	      receivedCerts: new Array() // tab of blocks number (only for members pubkeys)
	    });
	    cache.pub_index[joiners[j][0]] = cache.pubkeys.length-1;
	  }
	}
	
	// parse and split certifications
	certifications = JSON.parse(newBlocks[b].certifications);
	for (let c=0;c<certifications.length;c++)
	{
	  certifications[c] = certifications[c].split(":");
	  cache.pubkeys[cache.pub_index[certifications[c][0]]].writtenCerts.push(cache.blockchain.length+1);
	  cache.pubkeys[cache.pub_index[certifications[c][1]]].receivedCerts.push(cache.blockchain.length+1);
	  if (cache.pubkeys[cache.pub_index[certifications[c][0]]].writtenCerts.length == cache.Yn && cache.pubkeys[cache.pub_index[certifications[c][0]]].receivedCerts.length >= cache.Yn) { newSentries++; }
	  if (cache.pubkeys[cache.pub_index[certifications[c][1]]].writtenCerts.length >= cache.Yn && cache.pubkeys[cache.pub_index[certifications[c][1]]].receivedCerts.length == cache.Yn) { newSentries++; }
	}

	cache.blockchain.push({
	  hash: newBlocks[b].hash,
	  medianTime: newBlocks[b].medianTime,
	  sentries: (cache.blockchain.length > 0) ? cache.blockchain[cache.blockchain.length-1].sentries+newSentries:newSentries,
	});
      }
      
      // DEBUG BALANCE
      console.log("cache.destroyAmount = %s", cache.destroyAmount);
    }
    
    next()
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`)
  }
})
.catch((err) => console.error(err.stack || err));

