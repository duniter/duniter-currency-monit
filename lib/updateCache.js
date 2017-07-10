"use strict";

const co = require('co');
const constants = require(__dirname + '/constants')

/**
     * updateCache
     * 
     */
module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, cache } = req.app.locals

  try {
		// Définition des constantes
		const conf = duniterServer.conf;
		
		// Définition des variables
		let upgradeCache = false;
		
		// Cacluler s'il faut mettre à jour le cache ou pas
		upgradeCache = (Math.floor(Date.now() / 1000) > (cache.lastUptime + constants.MIN_CACHE_UPDATE_FREQ));
		
		// Si le cache membersCount est dévérouillé, le vérouiller, sinon ne pas réinitialiser le cache
		if (upgradeCache && !cache.lockMembersCount)
		{
			cache.lockMembersCount = true;
		}
		else if(cache.lockMembersCount)
		{
			upgradeCache = false;
		}

    // If fork, unstack cache
    let reinitBdd = false;
    if (cache.endBlock != null)
    {
      let checkBlock = yield duniterServer.dal.peerDAL.query('SELECT `hash` FROM block WHERE `fork`=0 AND `number`='+(cache.blockchain[cache.blockchain.length-1].number)+' LIMIT 1 ');
			if (cache.blockchain.length > 0 && cache.blockchain[cache.blockchain.length-1].hash != checkBlock[0].hash && upgradeCache)
      {
	/*// unstack loop
	while (cache.blockchain.length > 0  && cache.blockchain[cache.blockchain.length-1].hash != checkBlock[0].hash)
	{
	  // unstack cache.blockchain
	  cache.blockchain.pop();
	  
	  // unstack block
	  checkBlock = yield duniterServer.dal.peerDAL.query('SELECT `hash` FROM block WHERE `fork`=0 AND `number`='+(cache.blockchain.length-1)+' LIMIT 1 ');
	  
	  console.log("unstack block #%s", cache.blockchain.length-1);
	}
	
	let cacheTime = 0;
	if (cache.blockchain.length > 0 )
	{
	  cacheTime = cache.blockchain[cache.blockchain.length-1].medianTime;
	}
	else
	{*/
	  // reinitialize cache
	  cache.lastUptime = 0;
		cache.lockMembersCount = false;
		cache.beginBlock = null;
		cache.currentBlockNumber = 0;
		cache.currentBlockTime = 0;
		cache.currentSentries = 0;
		cache.endBlock = null;
		cache.step = null;
		cache.stepUnit = null;
		cache.stepTime = null;
		cache.onlyDate = null;
		cache.Yn = 0;
		cache.pubkeys = new Array();
		cache.pub_index = new Array();
		cache.blockchain = new Array();
	  
	  // reinitialize bdd
	  reinitBdd = true;
	/*}
	
	// unstak pubkeys joins during the fork (no-member pubkeys has considered join when then received currency for the first time)
	while (cache.pubkeys.length > 0 && cache.pubkeys[cache.pubkeys.length-1].join >= cache.blockchain.length) { cache.pubkeys.pop(); cache.pub_index.pop(); }

	// unstak transactions and certifications written during the fork
	for (let m=0;cache.pubkeys.length;m++)
	{
	  // unstak inputs
	  while (cache.pubkeys[m].inputsTime.length > 0 && cache.pubkeys[m].inputsTime[cache.pubkeys[m].inputsTime.length-1] > cacheTime)
	  {
	      cache.pubkeys[m].inputsTime.pop();
	      cache.pubkeys[m].inputsAmount.pop();
	  }
	  // unstak outputs
	  while (cache.pubkeys[m].outputsTime.length > 0 && cache.pubkeys[m].outputsTime[cache.pubkeys[m].outputsTime.length-1] > cacheTime)
	  {
	      cache.pubkeys[m].outputsTime.pop();
	      cache.pubkeys[m].outputsAmount.pop();
	  }
	  // unstak certs
	  while (cache.pubkeys[m].writtenCerts.length > 0 && cache.pubkeys[m].writtenCerts[cache.pubkeys[m].writtenCerts.length-1] > cache.blockchain.length) { cache.pubkeys[m].writtenCerts.pop(); }
	  while (cache.pubkeys[m].receivedCerts.length > 0 && cache.pubkeys[m].receivedCerts[cache.pubkeys[m].receivedCerts.length-1] > cache.blockchain.length) { cache.pubkeys[m].receivedCerts.pop(); }
	}*/
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
	  case "days": unitTime = 86400; cache.onlyDate = true; cache.stepUnit = "days"; break;
	  case "weeks": unitTime = 604800; cache.onlyDate = true; cache.stepUnit = "weeks"; break;
	  case "months": unitTime = 18144000; cache.onlyDate = true; cache.stepUnit = "months"; break;
	  case "years": unitTime = 31557600; cache.onlyDate = true; cache.stepUnit = "years"; break;
      }
    }
    // Default values
    else
    {
      unitTime = 86400; cache.onlyDate = true; cache.stepUnit = "days";
    }
    
    // get endBlock
    if ( typeof(req.query.end) == 'undefined' || req.query.end <= 0)
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
			let beginTime = cache.endBlock[0].medianTime-(parseInt(cache.step)*unitTime*constants.STEP_COUNT_MIN);
      cache.beginBlock =  yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`number` FROM block WHERE `fork`=0 AND `medianTime` >= \''+beginTime+'\' ORDER BY `medianTime` ASC LIMIT 1 ');
    }
    else { cache.beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`number` FROM block WHERE `fork`=0 AND `number`='+req.query.begin+' LIMIT 1 '); }
    
    // Apply STEP_COUNT_MAX and calculate stepTime
    if ( Math.ceil((cache.endBlock[0].medianTime-cache.beginBlock[0].medianTime)/(cache.step*unitTime)) > constants.STEP_COUNT_MAX  )
		{ cache.step = Math.ceil((cache.endBlock[0].medianTime-cache.beginBlock[0].medianTime)/(constants.STEP_COUNT_MAX*unitTime)); }
    cache.stepTime = parseInt(cache.step)*unitTime;

    // if new blocks and MIN_CACHE_UPDATE_FREQ pass, update cache
		if ( parseInt(cache.endBlock[0].number) >= cache.currentBlockNumber && Math.floor(Date.now() / 1000) > (cache.lastUptime + constants.MIN_CACHE_UPDATE_FREQ))
    {
      // let previousCacheTime = (cache.blockchain.length > 0) ? cache.blockchain[cache.blockchain.length-1].medianTime:0;
      var newBlocks = yield duniterServer.dal.peerDAL.query(
	'SELECT `hash`,`membersCount`,`medianTime`,`number`,`certifications`,`joiners`,`actives`,`revoked` FROM block WHERE `fork`=0 AND `medianTime` > '+cache.currentBlockTime+' AND `medianTime` <= '+cache.endBlock[0].medianTime+' ORDER BY `medianTime` ASC');
      
      /*if ( cache.currentBlockNumber > 0 && (newBlocks.length) != (parseInt(cache.endBlock[0].number)-cache.currentBlockNumber) )
      {
        console.log("newBlocks.length = %s", newBlocks.length);
	console.log("cache.endBlock[0].number = %s", cache.endBlock[0].number);
	console.log("cache.currentBlockNumber = %s", cache.currentBlockNumber);
	res.status(500).send('<pre>Fatal Error : newBlocks.length != (endBlock[0].number-cache.currentBlockNumber)</pre>');
      }*/
      
      // Initialise newJoiners
      let newJoiners = new Array();
      
      // Initialise delIdtys
      let delIdtys = new Array();
      
      for (let b=0;b<newBlocks.length;b++)
      {
	// Init let variables
	let newSentries=0;
	let expireCertsNumber=-1;
	let minReceivedCerts = 0;
	let revoked = [];
	let actives = [];
	let joiners = [];
	let certifications = [];
	
	/*// get expireCertsNumber
	let tmpExpireCertsBlock = yield duniterServer.dal.peerDAL.query(
	'SELECT `number` FROM block WHERE `fork`=0 AND `medianTime` > '+cache.currentBlockTime+' AND `medianTime` < '+(parseInt(newBlocks[b].medianTime)-sigValidity)+' ORDER BY `medianTime` DESC LIMIT 1');
        if (tmpExpireCertsBlock.length > 0) { expireCertsNumber = parseInt(tmpExpireCertsBlock[0].number); }
        
        // Suppr expires certs
        if (expireCertsNumber >= 0)
	{
	  for (let m=0;m<cache.pubkeys.length;m++)
	  {
	    //..
	  }
	}*/
        
        // For become sentrie, minReceivedCerts is max between Yn and sigQty
	minReceivedCerts = (cache.Yn<conf.sigQty) ? conf.sigQty:cache.Yn;

	// If Yn change, suppr sentries that not achieve new Yn value
	let newYn = Math.ceil(Math.pow(newBlocks[b].membersCount, 1/conf.stepMax));
	if (newYn > cache.Yn)
	{
	  for (let m=0;m<cache.pubkeys.length;m++)
	  {
	    if (cache.pubkeys[m].writtenCerts.length >= cache.Yn && cache.pubkeys[m].receivedCerts.length >= minReceivedCerts && cache.pubkeys[m].writtenCerts.length < newYn && cache.pubkeys[m].receivedCerts.length < newYn) { newSentries -= 1; }
	  }
	  minReceivedCerts = (newYn<conf.sigQty) ? conf.sigQty:newYn; // recalculate minReceivedCerts
	}
	cache.Yn = newYn;
	
	/*
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
	    //console.log("(b, t, i) = %s, %s, %s", b, t, i);
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
		balanceWithOthers: new Array(),
		pubkeyBalanceWithOthers: new Array(),
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
		balanceWithOthers: new Array(),
		pubkeyBalanceWithOthers: new Array(),
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
	      else
	      {
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
	    }
	    
	    // Push balanceWithOthers
	      let pubkeyId = cache.pub_index[pubkey];
	      if ( typeof(cache.pubkeys[cache.pub_index[issuer]].pubkeyBalanceWithOthers[pubkey]) != 'undefined')
	      {
		let idBalanceKey = cache.pubkeys[cache.pub_index[issuer]].pubkeyBalanceWithOthers[pubkey];
		cache.pubkeys[cache.pub_index[issuer]].balanceWithOthers[idBalanceKey] -= ouputAmout;
	      }
	      else if ( typeof(cache.pubkeys[pubkeyId].pubkeyBalanceWithOthers[issuer]) != 'undefined')
	      {
		let idBalanceKey = cache.pubkeys[pubkeyId].pubkeyBalanceWithOthers[issuer];
		cache.pubkeys[pubkeyId].balanceWithOthers[idBalanceKey] += ouputAmout;
	      }
	      else
	      {
		  cache.pubkeys[pubkeyId].balanceWithOthers.push(ouputAmout);
		  cache.pubkeys[pubkeyId].pubkeyBalanceWithOthers[issuer] = cache.pubkeys[pubkeyId].balanceWithOthers.length-1;
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
	*/

	// parse and split revoked
	revoked = JSON.parse(newBlocks[b].revoked);
	for (let r=0;r<revoked.length;r++)
	{
	  revoked[r] = revoked[r].split(":");
	  delIdtys.push(revoked[r][0]);
	  let tmpPubIndex = cache.pub_index[revoked[r][0]];
	  /*// Suppr receivers of writtenCerts
	  for (let wc=0;wc<cache.pubkeys[tmpPubIndex].writtenCerts.length;wc++)
	  {
	    let tmpPubIndex2 = cache.pub_index[cache.pubkeys[tmpPubIndex].writtenCerts[wc][1]];
	    for (let wc2=0;wc2<cache.pubkeys[tmpPubIndex2].receivedCerts.length;wc2++)
	    {
	      if ( cache.pubkeys[tmpPubIndex2].receivedCerts[wc2][1] == revoked[r][0] )
	      {
		cache.pubkeys[tmpPubIndex2].receivedCerts.splice(wc2,1);
		wc2 = cache.pubkeys[tmpPubIndex2].receivedCerts.length;
	      }
	    }
	  }
	  // Suppr issuers of receivedCerts
	  for (let rc=0;rc<cache.pubkeys[tmpPubIndex].receivedCerts.length;rc++)
	  {
	    let tmpPubIndex2 = cache.pub_index[cache.pubkeys[tmpPubIndex].receivedCerts[rc][1]];
	    for (let rc2=0;rc2<cache.pubkeys[tmpPubIndex2].writtenCerts.length;rc2++)
	    {
	      if ( cache.pubkeys[tmpPubIndex2].writtenCerts[rc2][1] == revoked[r][0] )
	      {
		cache.pubkeys[tmpPubIndex2].writtenCerts.splice(rc2,1);
		rc2 = cache.pubkeys[tmpPubIndex2].writtenCerts.length;
	      }
	    }
	  }*/
	  cache.pubkeys.splice(tmpPubIndex,1);
	}

	// parse and split actives
	actives = JSON.parse(newBlocks[b].actives);
	for (let a=0;a<actives.length;a++)
	{
	  actives[a] = actives[a].split(":");
	  cache.pubkeys[cache.pub_index[actives[a][0]]].expires_on = newBlocks[b].medianTime+conf.msValidity;
	}

	// parse and split joiners
	joiners = JSON.parse(newBlocks[b].joiners);
	for (let j=0;j<joiners.length;j++)
	{
	  joiners[j] = joiners[j].split(":");
	  if ( typeof(cache.pub_index[joiners[j][0]]) != 'undefined') 
	  {
	    let tmpPubkeyIndex = cache.pub_index[joiners[j][0]];
	    cache.pubkeys[tmpPubkeyIndex].updateWot = true;
	    cache.pubkeys[tmpPubkeyIndex].expires_on = newBlocks[b].medianTime+conf.msValidity;
	  }
	  else
	  {
	    cache.pubkeys.push({
	      updateWot: false,
	      expires_on: newBlocks[b].medianTime+conf.msValidity,
	      pub: joiners[j][0],
	      writtenCerts: new Array(),
	      receivedCerts: new Array()       
	    });
	    cache.pub_index[joiners[j][0]] = cache.pubkeys.length-1;
	    newJoiners.push(joiners[j][0]);
	  }
	}

	// parse and split certifications
	certifications = JSON.parse(newBlocks[b].certifications);
	for (let c=0;c<certifications.length;c++)
	{
	  certifications[c] = certifications[c].split(":");
	  // push cert to cache
	  cache.pubkeys[cache.pub_index[certifications[c][0]]].writtenCerts.push(certifications[c][2]);
	  cache.pubkeys[cache.pub_index[certifications[c][0]]].updateWot = true;
	  cache.pubkeys[cache.pub_index[certifications[c][1]]].receivedCerts.push(certifications[c][2]);
	  cache.pubkeys[cache.pub_index[certifications[c][1]]].updateWot = true;
	  
	  // Calculate if the issuer of cert become sentry
	  if (cache.pubkeys[cache.pub_index[certifications[c][0]]].writtenCerts.length == cache.Yn && cache.pubkeys[cache.pub_index[certifications[c][0]]].receivedCerts.length >= minReceivedCerts)
	  { newSentries++; }
	  
	  // Calculate if the receiver of cert become sentry
	  if (cache.pubkeys[cache.pub_index[certifications[c][1]]].writtenCerts.length >= cache.Yn && cache.pubkeys[cache.pub_index[certifications[c][1]]].receivedCerts.length == minReceivedCerts)
	  { newSentries++; }
	}

	if (newSentries != 0)
	{
	  cache.blockchain.push({
	    number: newBlocks[b].number,
	    hash: newBlocks[b].hash,
	    medianTime: newBlocks[b].medianTime,
	    newSentries: newSentries,
	    sentries: (cache.blockchain.length > 0) ? cache.blockchain[cache.blockchain.length-1].sentries+newSentries:newSentries
	  });
	}
      } // end of newBlocks loop

      // update cache.currentBlockNumber and cache.currentBlockTime
      cache.currentBlockNumber = cache.endBlock[0].number;
      cache.currentBlockTime = cache.endBlock[0].medianTime;
      
      /*// Write to currency-monit bdd 
      let db = new sqlite3.Database(dbPath);
      db.serialize(function() {
	// reinitialize bdd, if it requested
	if (reinitBdd) { db.exec("TRUNCATE TABLE `blocks`"); db.exec("TRUNCATE TABLE `pubkeys`"); }
	
	let sentriesCount = 0;
	let indexMedianTime = 0;
	db.all("SELECT sentries,medianTime FROM blocks ORDER BY medianTime DESC LIMIT 1", function(err, rows) {
	      if (err != null) { console.log(err); }
	      else if (rows.length > 0) { sentriesCount = rows[0].sentries; indexMedianTime = rows[0].medianTime; }
	    });
	var stmt = db.prepare("INSERT INTO blocks VALUES (?,?,?,?)");
	for (let i=0;i<cache.blockchain.length;i++)
	{
	  sentriesCount += cache.blockchain[i].newSentries;
	  if (cache.blockchain[i].newSentries != 0 && cache.blockchain[i].medianTime > indexMedianTime) { stmt.run(cache.blockchain[i].number, cache.blockchain[i].hash, cache.blockchain[i].medianTime, sentriesCount); }
	}
	stmt.finalize();
	// Delete revoked pubkeys
	var req_del_pubkeys = db.prepare("DELETE FROM pubkeys WHERE `pub` = ?");
	for (let i=0;i<delIdtys.length;i++) { req_del_pubkeys.run(delIdtys[i]); }
	req_del_pubkeys.finalize();
	// Update no-new pubkeys
	for (let i=0;i<cache.pubkeys.length;i++)
	{
	  // Update writtenCerts and receivedCerts
	  if (cache.pubkeys[i].updateWot)
	  {
	    db.exec("UPDATE `pubkeys` SET `writtenCerts` = '"+JSON.stringify(cache.pubkeys[i].writtenCerts)
	      +"', `receivedCerts` = '"+JSON.stringify(cache.pubkeys[i].receivedCerts)
	      +"' WHERE `pub` = '"+cache.pubkeys[i].pub+"'");
	  }
	}
	// Insert new pubkeys
	var req_insert_pubkeys = db.prepare("INSERT INTO pubkeys VALUES (?,?,?,?)");
	for (let i=0;i<newJoiners.length;i++)
	{
	  let pubIndex = cache.pub_index[newJoiners[i]];
	  req_insert_pubkeys.run(newJoiners[i], cache.pubkeys[pubIndex].expires_on,
		JSON.stringify(cache.pubkeys[pubIndex].writtenCerts), JSON.stringify(cache.pubkeys[pubIndex].receivedCerts));
	}
	req_insert_pubkeys.finalize();
      });
      db.close();*/
      
      // Upgrade lastUptime
      cache.lastUptime = Math.floor(Date.now() / 1000);
    }

      // Unlock Members count cache
      if (upgradeCache)
			{
        cache.lockMembersCount = false;
			}

    next()
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`)
  }
})
.catch((err) => console.error(err.stack || err));
