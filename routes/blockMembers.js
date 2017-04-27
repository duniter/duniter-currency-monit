"use strict";

const co = require('co')
const timestampToDatetime = require('../lib/timestampToDatetime')

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow } = req.app.locals
  
  try {
    // get GET parameters
    var begin = req.query.begin >= 0 && req.query.begin || 0;// Default Value
    var end = req.query.end >= 0 && req.query.end || -1;// Default Value is current timestamp
    var format = req.query.format || 'HTML'
    
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
    var idtys = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`pub` FROM i_index WHERE `wasMember`=1');

    // get current membersCount
    const currentMembersCount = blockchain[blockchain.length-1].membersCount;
    
    // create and initialize tabNbBlockByMember and tabIndexMembers
    var tabNbBlockByMember = [ [] ];
    var tabIndexMembers = [];
    for (let i=0;i<idtys.length;i++)
    {
      tabNbBlockByMember.push ({
        uid: idtys[i].uid,
        pubkey: idtys[i].pub,
        nbBlocks: 0,
        writtenPercent: 0,
        meanNonce: 0,
	color: 0
      });
      tabIndexMembers[idtys[i].pub] = i;
    }
    
    for (let b=0;b<blockchain.length;b++)
    {
      for (let m=0;m<tabNbBlockByMember.length;m++)
      {
        if (tabNbBlockByMember[m].pubkey == blockchain[b].issuer)
        {
          tabNbBlockByMember[m].nbBlocks++;
          tabNbBlockByMember[m].meanNonce += blockchain[b].nonce;
        }
      }
    }
    
    // calculate writtenPercent and meanNonce
    for (let m=0;m<tabNbBlockByMember.length;m++)
    {
      tabNbBlockByMember[m].writtenPercent = ((tabNbBlockByMember[m].nbBlocks * 100) / (blockchain.length)).toFixed(2);
      if (tabNbBlockByMember[m].nbBlocks > 0)
      {
        tabNbBlockByMember[m].meanNonce = (tabNbBlockByMember[m].meanNonce / (tabNbBlockByMember[m].nbBlocks*1000000000)).toFixed(0)+"*10^9";
      }
    }
    
    // trier le tableau par ordre croissant de nbBlocks
    var tabNbBlockByMemberSort = [ [] ];
    var tabExcluded = [];
    for (let m=0;m<tabNbBlockByMember.length;m++)
    {
      let max = -1;
      let idMax = 0;
      for (let m2=0;m2<tabNbBlockByMember.length;m2++)
      {
        if (tabNbBlockByMember[m2].nbBlocks > max)
        {
          let exclude = false;
          for (let e=0;e<tabExcluded.length;e++)
          {
            if (tabExcluded[e] == tabNbBlockByMember[m2].uid) { exclude = true; }
          }
          if (!exclude)
          {
            max = tabNbBlockByMember[m2].nbBlocks;
            idMax = m2;
          }
        }
      }
      tabNbBlockByMemberSort[m] = tabNbBlockByMember[idMax];
      tabExcluded.push(tabNbBlockByMember[idMax].uid);
    }
    
    // Define bar color
    for (let m=0;m<tabNbBlockByMemberSort.length;m++)
    {
      let proportion = ((255*tabNbBlockByMemberSort[m].nbBlocks)/tabNbBlockByMemberSort[0].nbBlocks);
      tabNbBlockByMemberSort[m].color = parseInt(proportion);
    }
    
    // Si le client demande la réponse au format JSON =, le faire
    if (format == 'JSON')
      res.status(200).jsonp( tabNbBlockByMemberSort )
    else
    {
      res.locals = {
         tabNbBlockByMemberSort, 
         begin, 
         end,
         NB_PARTS: 50
      }
      next()
    }
    // Appeler le module blockChart
    // let blockChartMod = blockChart(req, res, HTML_HEADERS, HTML_MENU, tabNbBlockByMemberSort, begin, end);
    
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
  }
})