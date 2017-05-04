"use strict";

const co = require('co')
const timestampToDatetime = require('../lib/timestampToDatetime')

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow } = req.app.locals
  
  try {
    // get GET parameters
    var begin = req.query.begin >= 0 && req.query.begin || 0; // Default begin Value is zero
    var end = req.query.end >= 0 && req.query.end || -1; // Default Value is -1 (=current block)
    var format = req.query.format || 'HTML';
    var data = req.query.data || 'nbBlocks';
    
    // get beginBlock and endBlock
    var beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `fork`=0 AND `number` = '+begin+' LIMIT 1');
    var endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `fork`=0 AND `number` = '+end+' LIMIT 1');
    
    // get blockchain
    if (end >= begin && begin >= 0)
    {
      var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` <= '+endBlock[0].medianTime+' AND `medianTime` >= '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');
    }
    else
    {
      var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` >= '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');
    }
   
    // get blockchain timestamp
    const currentBlockchainTimestamp = blockchain[blockchain.length-1].medianTime;
    if (end == -1) { end = begin+blockchain.length-1; }
    
    // get idtys list
    var idtys = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`pub`,`written_on` FROM i_index WHERE `wasMember`=1');

    // get current membersCount
    const currentMembersCount = blockchain[blockchain.length-1].membersCount;
    
    // create and initialize tabBlockMembers and tabIndexMembers
    var tabBlockMembers = [ [] ];
    var tabIndexMembers = [];
    for (let i=0;i<idtys.length;i++)
    {
      let tmpBecomeMember = idtys[i].written_on.split("-");
      tabBlockMembers.push ({
        uid: idtys[i].uid,
        pubkey: idtys[i].pub,
	becomeMember: (tmpBecomeMember[0] > begin) ? tmpBecomeMember[0]:begin,
        nbBlocks: 0,
        totalNonce: 0,
	data: 0,
	color: 0
      });
      tabIndexMembers[idtys[i].pub] = i;
    }
    
    for (let b=0;b<blockchain.length;b++)
    {
      for (let m=0;m<tabBlockMembers.length;m++)
      {
        if (tabBlockMembers[m].pubkey == blockchain[b].issuer)
        {
          tabBlockMembers[m].nbBlocks++;
          tabBlockMembers[m].totalNonce += parseInt((blockchain[b].nonce).toString().substr(3));
        }
      }
    }
    
    // calculate data (writtenPercent or meanNonce or writtenPercentSinceBecomeMember or  
    for (let m=0;m<tabBlockMembers.length;m++)
    {
      if (data == 'nbBlocks') { tabBlockMembers[m].data = tabBlockMembers[m].nbBlocks; }
      else if (data == 'writtenPercent')
      {
        tabBlockMembers[m].data = parseFloat( ((tabBlockMembers[m].nbBlocks * 100) / (blockchain.length)).toFixed(2) );
      }
      else if (data == 'meanNonce' && tabBlockMembers[m].nbBlocks > 0)    
      {
        tabBlockMembers[m].data = parseInt( (tabBlockMembers[m].totalNonce / (tabBlockMembers[m].nbBlocks*1000)).toFixed(0)+"*10^3" );
      }
      else if (data == 'writtenPercentSinceBecomeMember')
      {
	
        tabBlockMembers[m].data = parseFloat( ((tabBlockMembers[m].nbBlocks * 100) / (blockchain.length-tabBlockMembers[m].becomeMember)).toFixed(2) );
      }
    }
    
    // trier le tableau par ordre croissant de data nbBlocks
    var tabBlockMembersSort = [ [] ];
    var tabExcluded = [];
    for (let m=0;m<tabBlockMembers.length;m++)
    {
      let max = -1;
      let idMax = 0;
      for (let m2=0;m2<tabBlockMembers.length;m2++)
      {
        if (tabBlockMembers[m2].data > max)
        {
          let exclude = false;
          for (let e=0;e<tabExcluded.length;e++)
          {
            if (tabExcluded[e] == tabBlockMembers[m2].uid) { exclude = true; }
          }
          if (!exclude)
          {
            max = tabBlockMembers[m2].data;
            idMax = m2;
          }
        }
      }
      tabBlockMembersSort[m] = tabBlockMembers[idMax];
      tabExcluded.push(tabBlockMembers[idMax].uid);
    }
    
    // Define bar color
    for (let m=0;m<tabBlockMembersSort.length;m++)
    {
      let proportion = ((255*tabBlockMembersSort[m].data)/tabBlockMembersSort[0].data);
      tabBlockMembersSort[m].color = parseInt(proportion);
    }
    
    //define dataLabel
    var dataLabel = '#Written blocks';
    if (data == 'writtenPercent') { dataLabel = "\% blockchain"; }
    else if (data == 'writtenPercentSinceBecomeMember') { dataLabel = "\% blockchain (since become member)"; }
    else if (data == 'meanNonce') { dataLabel = '#Mean nonce (in thousands)'; }
    
    // Si le client demande la réponse au format JSON =, le faire
    if (format == 'JSON')
      res.status(200).jsonp( tabBlockMembersSort )
    else
    {
      res.locals = {
         tabBlockMembersSort, 
         begin, 
         end,
	 data,
	 dataLabel,
         NB_PARTS: 50
      }
      next()
    }
    
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
  }
})