"use strict";

const co = require('co')
const timestampToDatetime = require('../lib/timestampToDatetime')

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow } = req.app.locals
  
  try {
    
    // get blockchain timestamp
    let resultQueryCurrentBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block ORDER BY `medianTime` DESC LIMIT 1 ');
    const currentBlockchainTimestamp = resultQueryCurrentBlock[0].medianTime;
    
    // Initaliser les variables
    var contenu = "";
    var membersIdentity = [];
    var membersFirstCertifExpire = [];
    var membersIssuerFirstCertif = [];
    var membersCertifsList = [ [ [] ] ];
    var membersPendingCertifsList = [ [ [] ] ];
    var membershipsTimeList = [];
    var membershipsBlockNumberList = [];
    var membershipsExpireTimeList = [];
    
    // Récupéré les paramètres
    var days = req.query.d || 400// Valeur par défaut
    var order = req.query.d && req.query.order || 'desc' // Valeur par défaut
    var sort_by = req.query.sort_by || "idtyWritten" // Valeur par défaut
    var pendingSigs = req.query.pendingSigs || "no";
    var format = req.query.format || 'HTML'
    console.log(req.query);
    
    // Récupérer la liste des identités ayant actuellement le statut de membre
    const membersList = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`pub`,`member`,`written_on` FROM i_index WHERE `member`=1');
    
    // Récupérer pour chaque identité, le numéro du block d'écriture du dernier membership
    // Ainsi que la première ou dernière certification
    var nbMaxCertifs = 0;
    for (let m=0;m<membersList.length;m++)
    {
      // Récupérer les blockstamp d'écriture et date d'expiration du membership courant du membre m
      let tmpQueryResult = yield duniterServer.dal.peerDAL.query(
          'SELECT `written_on`,`expires_on` FROM m_index WHERE `pub`=\''+membersList[m].pub+'\' ORDER BY `expires_on` DESC LIMIT 1');
        membershipsExpireTimeList.push(tmpQueryResult[0].expires_on);
        
      // Extraire le numéro de bloc du blockstamp d'écriture du membership courant
      let blockstampMembershipWritten = tmpQueryResult[0].written_on.split("-"); // Separate blockNumber and blockHash
      membershipsBlockNumberList.push(blockstampMembershipWritten[0]);
      
      // Extraire le numéro de bloc du blockstamp d'écriture de l'identité du membre
      let blockstampIdtyWritten = membersList[m].written_on.split("-"); // Separate blockNumber and blockHash
      
      // Récupérer le champ medianTime du bloc d'écriture de l'identité du membre
      let resultQueryTimeWrittenIdty = yield duniterServer.dal.peerDAL.query(
          'SELECT `medianTime` FROM block WHERE `number`=\''+blockstampIdtyWritten[0]+'\' LIMIT 1')
      
      // Stocker les informations de l'identité
      membersIdentity.push({
        writtenBloc: blockstampIdtyWritten[0],
        writtenTimestamp: resultQueryTimeWrittenIdty[0].medianTime
        });
      
      // récupérer toutes les certification  reçus par l'utilisateur
      let tmpQueryCertifsList = [];
      if (sort_by == "lastSig")
      {
        tmpQueryCertifsList = yield duniterServer.dal.peerDAL.query(
          'SELECT `issuer`,`written_on`,`expires_on` FROM c_index WHERE `receiver`=\''+membersList[m].pub+'\' ORDER BY `expires_on` DESC');
      }
      else
      {
        tmpQueryCertifsList = yield duniterServer.dal.peerDAL.query(
          'SELECT `issuer`,`written_on`,`expires_on` FROM c_index WHERE `receiver`=\''+membersList[m].pub+'\' ORDER BY `expires_on` ASC');
      }

      // Calculer le nombre de certifications reçus par le membre courant
      let nbWrittenCertifs = tmpQueryCertifsList.length;
      
      // Récupérer les uid des émetteurs des certifications reçus par l'utilisateur
      // Et stocker les uid et dates d'expiration dans un tableau
      membersCertifsList[m] = new Array();
      for (var i=0;i<nbWrittenCertifs;i++)
      {
        let tmpQueryGetUidIssuerCert = yield duniterServer.dal.peerDAL.query('SELECT `uid` FROM i_index WHERE `pub`=\''+tmpQueryCertifsList[i].issuer+'\' LIMIT 1');
        let tmpBlockWrittenOn = tmpQueryCertifsList[i].written_on.split("-");
        
        // Stoker la liste des certifications qui n'ont pas encore expirées
        if (tmpQueryCertifsList[i].expires_on > currentBlockchainTimestamp)
        {
          if (i == 0)
          {
        membersIssuerFirstCertif.push(tmpQueryGetUidIssuerCert[0].uid);
        membersFirstCertifExpire.push(tmpQueryCertifsList[0].expires_on);
          }
          membersCertifsList[m].push({
          issuer: tmpQueryGetUidIssuerCert[0].uid,
          writtenBloc: tmpBlockWrittenOn[0],
          timestampExpire: tmpQueryCertifsList[i].expires_on
          });
        }
      }
      
      // SI LES CERTIFICATIONS EN PISCINE SONT DEMANDÉES
      let nbValidPendingCertifs = 0;
      if (pendingSigs == "yes")
      {
        // récupérer toutes les certification en piscine destinées à l'utilisateur
        let tmpQueryPendingCertifsList = [];
        if (sort_by == "lastSig")
        {
          tmpQueryPendingCertifsList = yield duniterServer.dal.peerDAL.query(
        'SELECT `from`,`block_number`,`expires_on` FROM certifications_pending WHERE `to`=\''+membersList[m].pub+'\' ORDER BY `expires_on` DESC');
        }
        else
        {
          tmpQueryPendingCertifsList = yield duniterServer.dal.peerDAL.query(
        'SELECT `from`,`block_number`,`expires_on` FROM certifications_pending WHERE `to`=\''+membersList[m].pub+'\' ORDER BY `expires_on` ASC');
        }
        
        // Calculer le nombre de certifications en attentes destinées au membre courant
        let nbPendingCertifs = tmpQueryPendingCertifsList.length;
        
        // Récupérer les uid des émetteurs des certifications reçus par l'utilisateur
        // Et stocker les uid et dates d'expiration dans un tableau
        membersPendingCertifsList[m] = new Array();
        for (var i=0;i<nbPendingCertifs;i++)
        {
          let tmpQueryGetUidIssuerPendingCert = yield duniterServer.dal.peerDAL.query('SELECT `uid` FROM i_index WHERE `pub`=\''+tmpQueryPendingCertifsList[i].from+'\' LIMIT 1');
          // Vérifier que l'émetteur de la certification correspond à une identié connue
          if ( tmpQueryGetUidIssuerPendingCert.length > 0 )
          {
        // récupérer le timestamp d'écriture de la dernière certification écrite par l'émetteur
        let tmpQueryLastIssuerCert = yield duniterServer.dal.peerDAL.query('SELECT `chainable_on` FROM c_index WHERE `issuer`=\''+tmpQueryPendingCertifsList[i].from+'\' ORDER BY `expires_on` DESC LIMIT 1');
        
        // Stoker la liste des certifications en piscine qui n'ont pas encore expirées
        if (tmpQueryPendingCertifsList[i].expires_on > currentBlockchainTimestamp)
        {
          membersPendingCertifsList[m].push({
              from: tmpQueryGetUidIssuerPendingCert[0].uid,
              blockNumber: tmpQueryPendingCertifsList[i].block_number,
              timestampExpire: tmpQueryPendingCertifsList[i].expires_on,
              timestampWritable: (tmpQueryLastIssuerCert[0].chainable_on)
          });
          nbValidPendingCertifs++;
        }
          }
        }
      }
      
      // Calculer le nombre maximal de certifications reçus par le membre courant
      let nbCertifs = nbWrittenCertifs + nbValidPendingCertifs;
      if ( nbCertifs > nbMaxCertifs) { nbMaxCertifs = nbCertifs; }
    }
    
    // Convertir chaque blockNumber (de membership) en timestamp
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
    var membersCertifsListSorted = [ [] ];

    // Calculer le timestamp limite à prendre en compte
    var limitTimestamp = currentBlockchainTimestamp + (days*86400);
        
    // trier les membres par ordre croissant/decroissant du critère sort_by
    var tabSort = [];
    if (sort_by == "idtyWritten")
    { 
      for (const memberIdentity of membersIdentity)
      { tabSort.push(memberIdentity.writtenTimestamp); }
    }
    else if (sort_by == "expireMembership")
    {
      for (const membershipExpireTimeList of membershipsExpireTimeList)
      { tabSort.push(membershipExpireTimeList); }
    }
    else if (sort_by == "lastRenewal")
    { 
      for (const membershipTimeList of membershipsTimeList)
      { tabSort.push(membershipTimeList[0].medianTime); }
    }
    else if (sort_by == "oldestSig" || sort_by == "lastSig")
    { 
      for (const memberCertifsList of membersFirstCertifExpire)
      { tabSort.push(memberCertifsList); }
    }
    else if (sort_by == "sigCount")
    { 
      for (const memberCertifsList of membersCertifsList)
      {
        tabSort.push(memberCertifsList.length);
      }
    }
    else { contenu += "<p>ERREUR : param <i>sort_by</i> invalid !</p>"; }
    for (var i=0;i<membersList.length;i++)
    {
      var maxTime = 0;
      if (order == 'asc') { maxTime = currentBlockchainTimestamp + (msValidity*2); }
      var idMaxTime =0;
      for (var j=0;j<membersList.length;j++) {
        if ( (order == 'desc' && tabSort[j] > maxTime)
          || (order == 'asc' && tabSort[j] > 0 && tabSort[j] < maxTime) )
        {
          maxTime = tabSort[j];
          idMaxTime = j;
        }
      }
      
      // Push max value on sort table, only if respect days limit
      if (limitTimestamp > membershipsExpireTimeList[idMaxTime])
      {
        // Push max value on sort table
        membersListOrdered.push({
          uid: membersList[idMaxTime].uid,
          pub: membersList[idMaxTime].pub,
          idtyWrittenTimestamp: membersIdentity[idMaxTime].writtenTimestamp,
          idtyWrittenBloc: membersIdentity[idMaxTime].writtenBloc,
          lastRenewalTimestamp: membershipsTimeList[idMaxTime][0].medianTime,
          lastRenewalWrittenBloc: membershipsBlockNumberList[idMaxTime],
          expireMembershipTimestamp: membershipsExpireTimeList[idMaxTime],
          certifications: membersCertifsList[idMaxTime],
          pendingCertifications: membersPendingCertifsList[idMaxTime]
        });
        
        membersCertifsListSorted.push({
        issuer: membersCertifsList[idMaxTime].issuer,
        writtenBloc: membersCertifsList[idMaxTime].writtenBloc,
        timestampExpire: membersCertifsList[idMaxTime].timestampExpire
        });
      }
      // Exclure la valeur max avant de poursuivre le tri
      tabSort[idMaxTime] = -1;
    }
    
    // Si le client demande la réponse au format JSON =, le faire
    if (format == 'JSON')
    {
      // Send JSON reponse
      res.status(200).jsonp( membersListOrdered )
    }
    // Sinon, printer le tableau html
    else
    {
      
      res.locals = {
        
        days, sort_by, order,
        pendingSigs,
        
        currentBlockchainTimestamp,
        limitTimestamp,
        sigWindow,
        idtyWindow,
        msValidity,
        sigValidity,
        nbMaxCertifs,
        
        membersListOrdered,
        membersListFiltered: membersListOrdered.filter( member=> 
              member.expireMembershipTimestamp < limitTimestamp 
              && member.expireMembershipTimestamp > currentBlockchainTimestamp
            ),
        
        // Template helpers
        
        timestampToDatetime,
        // Calculer la proportion de temps restant avant l'expiration
        color: function( timestamp, idtyWindow, max )
        {
          let proportion = ((timestamp-currentBlockchainTimestamp)*max)/idtyWindow;
          proportion = proportion < 0 ? 0 : proportion > max ? max : proportion 
          let hex = parseInt( proportion ).toString(16)
          return `#${hex}${hex}${hex}`
        },
        /**
         * background: hsl( ${proportion(item.time,period,1,120)}, 100%, 50%, 1 )
         * background: hsl( 0, 0%, ${proportion(item.time,period,0,200)}, 1 )
         * background: #${proportion()}${proportion()}${proportion()}
         */
        proportion: function( timestamp, maxRange, min, max )
        {
          let proportion = ( (timestamp-currentBlockchainTimestamp) * max ) / maxRange
          proportion = proportion < 0 ? 0 : proportion > max ? max : proportion 
          return proportion
        },
        // color2: function( timestamp, maxRange, max )
        // {
        //   // Calculer la proportion de membership restant (en pour 255ème)
        //   let proportion = ((timestamp-currentBlockchainTimestamp)*max)/maxRange;
        //   proportion = proportion < 0 ? 0 : proportion > max ? max : proportion 
          
        //   // Calculer la couleur à attribuer à cette ligne (dégradé du vert au rouge)
        //   let color="";
        //   let tmpRed = 255-(membershipProportion);
        //   if ( tmpRed < 16 ) { color = "0"; }
        //   color += parseInt(tmpRed).toString(16);
        //   let tmpGreen = (membershipProportion);
        //   if ( tmpGreen < 16 ) { color += "0"; }
        //   color += parseInt(tmpGreen).toString(16);
        //   color += "00";
          
        // }
      }
      next()
    }
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`)
  }
  
})