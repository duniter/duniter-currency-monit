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

		// Define nbMaxPoints and adaptMaxPoints
		if ( typeof(req.query.nbMaxPoints) != 'undefined' && req.query.nbMaxPoints > 0 ) {
			cache.nbMaxPoints = req.query.nbMaxPoints;
		} else {
			cache.nbMaxPoints = constants.STEP_COUNT_MAX;
		}
		if ( typeof(req.query.adaptMaxPoints) != 'undefined' && (req.query.adaptMaxPoints == "step" || req.query.adaptMaxPoints == "end")) {
			cache.adaptMaxPoints = req.query.adaptMaxPoints;
		} else {
			cache.adaptMaxPoints = "begin";
		}
		
		// Apply nbMaxPoints and adaptMaxPoints
		if (cache.adaptMaxPoints == "begin")
		{
			if ( Math.ceil((cache.endBlock[0].medianTime-cache.beginBlock[0].medianTime)/(cache.step*unitTime)) > cache.nbMaxPoints  )
			{
				let newBeginTime = cache.endBlock[0].medianTime-cache.step*cache.nbMaxPoints*unitTime;
				cache.beginBlock =  yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`number` FROM block WHERE `fork`=0 AND `medianTime` >= \''+newBeginTime+'\' ORDER BY `medianTime` ASC LIMIT 1 ');
			}
		} else if (cache.adaptMaxPoints == "step") {
			cache.step = Math.ceil((cache.endBlock[0].medianTime-cache.beginBlock[0].medianTime)/(constants.STEP_COUNT_MAX*unitTime));
		} else {
			let newEndTime = cache.beginBlock[0].medianTime+cache.step*cache.nbMaxPoints*unitTime;
			cache.endBlock =  yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`number` FROM block WHERE `fork`=0 AND `medianTime` <= \''+newEndTime+'\' ORDER BY `medianTime` DESC LIMIT 1 ');
		}
    
		// Calculate stepTime
    cache.stepTime = parseInt(cache.step)*unitTime;

    // if new blocks and MIN_CACHE_UPDATE_FREQ pass, update cache
		if ( parseInt(cache.endBlock[0].number) >= cache.currentBlockNumber && Math.floor(Date.now() / 1000) > (cache.lastUptime + constants.MIN_CACHE_UPDATE_FREQ))
    {
      // let previousCacheTime = (cache.blockchain.length > 0) ? cache.blockchain[cache.blockchain.length-1].medianTime:0;
      var newBlocks = yield duniterServer.dal.peerDAL.query('SELECT `hash`,`membersCount`,`medianTime`,`number`,`certifications`,`joiners`,`actives`,`revoked` FROM block WHERE `fork`=0 AND `medianTime` > '+cache.currentBlockTime+' AND `medianTime` <= '+cache.endBlock[0].medianTime+' ORDER BY `medianTime` ASC');
      
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
				if (newYn > cache.Yn && cache.Yn > 0)
				{
					for (let m=0;m<cache.pubkeys.length;m++)
					{
						if (cache.pubkeys[m].writtenCerts.length >= cache.Yn && cache.pubkeys[m].receivedCerts.length >= minReceivedCerts && (cache.pubkeys[m].writtenCerts.length < newYn || cache.pubkeys[m].receivedCerts.length < newYn)) { newSentries -= 1; }
					}
					minReceivedCerts = (newYn<conf.sigQty) ? conf.sigQty:newYn; // recalculate minReceivedCerts
				}
				cache.Yn = newYn;

				// parse and split revoked
				revoked = JSON.parse(newBlocks[b].revoked);
				for (let r=0;r<revoked.length;r++)
				{
					revoked[r] = revoked[r].split(":");
					delIdtys.push(revoked[r][0]);
					let tmpPubIndex = cache.pub_index[revoked[r][0]];
					//cache.pubkeys.splice(tmpPubIndex,1);
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
