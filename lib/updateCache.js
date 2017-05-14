"use strict";

const co = require('co');

/**
     * updateCache
     * 
     */
module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow, sigQty, stepMax, cache } = req.app.locals

  try {
    // get endBlock
    let endBlock;
    if ( typeof(req.query.end) == 'undefined' || req.query.end < 0)
    {
      endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`number`,`membersCount` FROM block WHERE `fork`=0 ORDER BY `medianTime` DESC LIMIT 1 ');
      cache.end = endBlock[0].number;
    }
    else
    {
      cache.end = req.query.end;
      endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`number`,`membersCount` FROM block WHERE `fork`=0 AND `number`='+cache.end+' LIMIT 1 ');
      if ( typeof(endBlock[0]) == 'undefined' )
      {
	res.status(500).send('<pre>Error : end parameter must be <= current block number !</pre>');
      }
    }

    // if new blocks, update cache
    if ( parseInt(endBlock[0].number) >= cache.blockchain.length )
    {
      let previousCacheTime = (cache.blockchain.length > 0) ? cache.blockchain[cache.blockchain.length-1].medianTime:0;
      var newBlocks = yield duniterServer.dal.peerDAL.query(
	'SELECT `hash`,`membersCount`,`medianTime`,`number`,`joiners`,`certifications`,`issuersCount` FROM block WHERE `fork`=0 AND `medianTime` > '+previousCacheTime+' AND `medianTime` <= '+endBlock[0].medianTime+' ORDER BY `medianTime` ASC');
    
      console.log("newBlocks.length = %s, endBlock[0].number= %s, cache.blockchain.length = %s", newBlocks.length, parseInt(endBlock[0].number), cache.blockchain.length); // DEBUG
      
      if ( cache.blockchain.length > 0 && (newBlocks.length-1) != (parseInt(endBlock[0].number)-cache.blockchain.length) )
      {
	res.status(500).send('<pre>Fatal Error : newBlocks.length != (endBlock[0].number-cache.blockchain.length)</pre>');
      }
      
      for (let b=0;b<newBlocks.length;b++)
      {
	// Init let variables
	let newSentries=0;
	let joiners = [];
	let certifications = [];
	
	// If Yn change, suppr sentries that not achieve new Yn value
	let newYn = Math.ceil(Math.pow(endBlock[0].membersCount, 1/stepMax));
	if (cache.Yn > 0 && newYn > cache.Yn)
	{
	  for (let m=0;m<cache.members.length;m++)
	  {
	    if (cache.members.writtenCerts >= cache.Yn && cache.members.receivedCerts >= cache.Yn && cache.members.writtenCerts < newYn && cache.members.receivedCerts < newYn) { newSentries -= 1; }
	  }
	}
	cache.Yn = newYn;
	
	// parse and split joiners
	joiners = JSON.parse(newBlocks[b].joiners);
	for (let j=0;j<joiners.length;j++)
	{
	  joiners[j] = joiners[j].split(":");
	  cache.members.push({
	    pub: joiners[j][0],
	    writtenCerts: 0,
	    receivedCerts: 0
	  });
	  cache.pub_index[joiners[j][0]] = cache.members.length-1;
	}
	
	// parse and split certifications
	certifications = JSON.parse(newBlocks[b].certifications);
	for (let c=0;c<certifications.length;c++)
	{
	  certifications[c] = certifications[c].split(":");
	  cache.members[cache.pub_index[certifications[c][0]]].writtenCerts++;
	  cache.members[cache.pub_index[certifications[c][1]]].receivedCerts++;
	  if (cache.members[cache.pub_index[certifications[c][0]]].writtenCerts == cache.Yn && cache.members[cache.pub_index[certifications[c][0]]].receivedCerts>= cache.Yn) { newSentries++; }
	  if (cache.members[cache.pub_index[certifications[c][1]]].writtenCerts >= cache.Yn && cache.members[cache.pub_index[certifications[c][1]]].receivedCerts== cache.Yn) { newSentries++; }
	}

	cache.blockchain.push({
	  medianTime: newBlocks[b].medianTime,
	  sentries: (cache.blockchain.length > 0) ? cache.blockchain[cache.blockchain.length-1].sentries+newSentries:newSentries,
	});
      }
    }
    
    next()
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`)
  }
})
.catch((err) => console.error(err.stack || err));

