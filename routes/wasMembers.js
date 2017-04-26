"use strict";

const co = require('co')
const timestampToDatetime = require('../lib/timestampToDatetime')

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, msValidity } = req.app.locals
  
  try {
    // get blockchain timestamp
    let resultQueryCurrentBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block ORDER BY `medianTime` DESC LIMIT 1 ');
    const currentBlockchainTimestamp = resultQueryCurrentBlock[0].medianTime;
    
    // Initaliser les variables
    // var contenu = HTML_HEADERS+'</head><body>'+HTML_MENU;
    // var contenu = HTML_MENU;
    var nbExpirMembers = 0;
    var membersBlockExcluded = [];
    var membershipsTimeList = [];
    var membershipsBlockNumberList = [];
    var membershipsExpireTimeList = [];
    
    // Récupérer les paramètres
    var order = req.query.order || 'asc' // Valeur par défaut
    console.log(req.query);
    
    // Récupérer la liste des identités n'étant plus membres
    const membersList = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`pub`,`member`,`written_on` FROM i_index WHERE `member`=0 AND `wasMember`=1');
    
    for (const member of membersList) {
      // Récupérer pour chaque identité, le numéro du block d'écriture de son exclusion
      let tmpArray = member.written_on.split("-");
      membersBlockExcluded.push(tmpArray[0]);
      
      // Récupérer pour chaque identité, le numéro du block d'écriture du dernier membership
      let tmpQueryResult = yield duniterServer.dal.peerDAL.query(
          'SELECT `written_on`,`expires_on` FROM m_index WHERE `pub`=\''+member.pub+'\' ORDER BY `written_on` DESC LIMIT 1');
        membershipsExpireTimeList.push(tmpQueryResult[0].expires_on);
      tmpArray = tmpQueryResult[0].written_on.split("-"); // Separate blockNumber and blockHash
      membershipsBlockNumberList.push(tmpArray[0]);
    }
    // Convertir chaque blockNumber en timestamp
    for (const membershipBlockNumber of membershipsBlockNumberList) {
      membershipsTimeList.push(yield duniterServer.dal.peerDAL.query(
          'SELECT `medianTime` FROM block WHERE `number`=\''+membershipBlockNumber+'\' LIMIT 1') );
    }
    
    // Traiter les cas ou expires_on est indéfini
    for (let i=0;i<membershipsExpireTimeList.length;i++) {
      if (membershipsExpireTimeList[i] == null)
      {
        membershipsExpireTimeList[i] = membershipsTimeList[i] + msValidity;
      }
    }
    	
    // Initialiser le tableau membersListOrdered
    var membersListOrdered = [ [] ];
    	
    // trier les membres par ordre decroissant de block de sortie (membersBlockExcluded)
    for (var i=0;i<membersList.length;i++) {
      var maxBlock = 0;
      var idMaxBlock =0;
      for (var j=0;j<membersList.length;j++) {
        if ( membersBlockExcluded[j] > maxBlock )
        {
          maxBlock = membershipsExpireTimeList[j];
          idMaxBlock = j;
        }
      }
    
      if (i > 0) {
        membersListOrdered.push([membersList[idMaxBlock].uid,
    	membershipsTimeList[idMaxBlock][0].medianTime,
    	membersBlockExcluded[idMaxBlock],
    	membershipsExpireTimeList[idMaxBlock],
    	membersList[idMaxBlock].member]);
      } else {
        membersListOrdered[i][0] =  membersList[idMaxBlock].uid;
        membersListOrdered[i][1] =  membershipsTimeList[idMaxBlock][0].medianTime;
        membersListOrdered[i][2] =  membersBlockExcluded[idMaxBlock];
        membersListOrdered[i][3] =  membershipsExpireTimeList[idMaxBlock];
        membersListOrdered[i][4] = membersList[idMaxBlock].member;
      }
    	  
      membershipsExpireTimeList[idMaxBlock] = -1;
    }
    
    // On parcour tout les membres pour afficher ceux qui ont expiré
    // nbExpirMembers = 0;
    // contenu += '<b>Membres dont le statut de membre a déjà expiré :</b><br><table border=1>';
    // for (var i=0;i<membersList.length;i++) {
    //   if (membersListOrdered[i][3] < currentBlockchainTimestamp && membersListOrdered[i][4] == 0) {
    //     // Printer les nom des colonnes
    //     if (nbExpirMembers == 0) {
    //       contenu += "<tr><td align='center'>uid</td><td align='center'> date dernier renouvellement </td><td align='center'>n° bloc sortie</td><td align='center'> date d'expiration </td></tr>";
    //     }
    //     // Convertir timestamp en date
    //     var tmpDateLastRenewal = new Date(membersListOrdered[i][1]*1000);
    //     var tmpDateExpire = new Date((membersListOrdered[i][3])*1000);
    //     contenu += "<tr><td align='center'>"+membersListOrdered[i][0]+"</td><td align='center'>"+tmpDateLastRenewal.getDate()+"/"
    //       +(tmpDateLastRenewal.getMonth()+1)+"/"+tmpDateLastRenewal.getFullYear()+" "
    //       +tmpDateLastRenewal.getHours()+":"+tmpDateLastRenewal.getMinutes()+":"+tmpDateLastRenewal.getSeconds()
    //       +"</td><td align='center'>"
    //       +membersListOrdered[i][2]+"</td><td align='center'>"
    //       +tmpDateExpire.getDate()+"/"+(tmpDateExpire.getMonth()+1)+"/"+tmpDateExpire.getFullYear()+" "
    //       +tmpDateExpire.getHours()+":"+tmpDateExpire.getMinutes()+":"+tmpDateExpire.getSeconds()+"</td></tr>";
    //     nbExpirMembers++;
    //   }
    // }
    // contenu += "<tr><td align='center' colspan=4> total : <b>"+nbExpirMembers+"</b> membres.</td><t/tr></table><br><hr>";
    
    // Send html page
    res.locals = {
      membersList,
      membersListOrdered,
      membersListFiltered: membersListOrdered.filter( member=> 
                              member[3] < currentBlockchainTimestamp && member[4] == 0 ),
      
      // Template helpers
      timestampToDatetime,
      
    }
    next()
  } catch (e) {
    // Display the message if exception
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
  }
})