"use strict";

const Q = require('q');
const _ = require('underscore');
const co = require('co');
const http = require('http');
const morgan = require('morgan');
const express = require('express');
const bodyParser = require('body-parser');

function timestampToDatetime(timestamp) {
	    // Convertir le timestamp en datetime
	    let tmptimestampExpireCertif = new Date(timestamp*1000);//tmpQueryGetTimeWrittenCert[0].medianTime)*1000);
	    let tmptimestampExpireCertifDay = tmptimestampExpireCertif.getDate();
	    if (tmptimestampExpireCertifDay < 10 ) { tmptimestampExpireCertifDay = "0"+tmptimestampExpireCertifDay; }
	    let tmptimestampExpireCertifMonth = tmptimestampExpireCertif.getMonth()+1;
	    if (tmptimestampExpireCertifMonth < 10 ) { tmptimestampExpireCertifMonth = "0"+tmptimestampExpireCertifMonth; }
	    
	    // Formater les heures
	    let tmptimestampExpireCertifhours = tmptimestampExpireCertif.getHours();
	    if (tmptimestampExpireCertifhours < 10 ) { tmptimestampExpireCertifhours = "0"+tmptimestampExpireCertifhours; }
	    let tmptimestampExpireCertifMinutes = tmptimestampExpireCertif.getMinutes();
	    if (tmptimestampExpireCertifMinutes < 10 ) { tmptimestampExpireCertifMinutes = "0"+tmptimestampExpireCertifMinutes; }
	    let tmptimestampExpireCertifSeconds = tmptimestampExpireCertif.getSeconds();
	    if (tmptimestampExpireCertifSeconds < 10 ) { tmptimestampExpireCertifSeconds = "0"+tmptimestampExpireCertifSeconds; }

	    var stringDateTime = tmptimestampExpireCertifDay+"/"+tmptimestampExpireCertifMonth+"/"+tmptimestampExpireCertif.getFullYear()+" "
		  +tmptimestampExpireCertifhours+":"+tmptimestampExpireCertifMinutes+":"+tmptimestampExpireCertifSeconds;
		  
    return stringDateTime;
}

module.exports = (host, port, duniterServer, sigValidity, msValidity) => {

  var app = express();

  app.use(morgan('\x1b[90m:remote-addr - :method :url HTTP/:http-version :status :res[content-length] - :response-time ms\x1b[0m', {
    stream: {
      write: function(message){
        message && console.log(message.replace(/\n$/,''));
      }
    }
  }));
  app.use(bodyParser.urlencoded({ extended: true }));

  app.get('/members', (req, res) => co(function *() {
    
    try {
      // get current timestamp
      const currentDate = new Date();
      const currentTimestamp = Math.round(currentDate.getTime() / 1000);
      
      // Initaliser les variables
      var contenu = "";
      var membersFirstCertifExpire = [];
      var membersIssuerFirstCertif = [];
      var membersCertifsList = [ [ [] ] ];
      var membershipsTimeList = [];
      var membershipsBlockNumberList = [];
      var membershipsExpireTimeList = [];
      
      // Récupéré les paramètres
      var days = 30;// Valeur par défaut
      if( typeof(req.query.d) == 'undefined' ) {
        days = 30;
      } else {
	  days = req.query.d;
      }
      var order = 'asc'; // Valeur par défaut
      if (typeof(req.query.d) != 'undefined' && req.query.order == 'desc') {
	order = 'desc';
      }
      var sort_by="lastRenewal"; // Valeur par défaut
      if (typeof(req.query.sort_by) != 'undefined') {
	sort_by = req.query.sort_by;
      }
      console.log(req.query);
      
	// Récupérer la liste des identités ayant actuellement le statut de membre
	const membersList = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`pub`,`member` FROM i_index WHERE `member`=1');
	
	// Récupérer pour chaque identité, le numéro du block d'écriture du dernier membership
	// Ainsi que la première ou dernière certification
	var nbMaxCertifs = 0;
	for (let m=0;m<membersList.length;m++)
	{
	  let tmpQueryResult = yield duniterServer.dal.peerDAL.query(
	      'SELECT `written_on`,`expires_on` FROM m_index WHERE `pub`=\''+membersList[m].pub+'\' ORDER BY `written_on` DESC LIMIT 1');
	    membershipsExpireTimeList.push(tmpQueryResult[0].expires_on);
	  let tmpArray = tmpQueryResult[0].written_on.split("-"); // Separate blockNumber and blockHash
	  membershipsBlockNumberList.push(tmpArray[0]);
	  
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

	  // Calculer le nombre maximal de certifications reçus par 1 membre
	  let nbCertifs = tmpQueryCertifsList.length;
	  if ( nbCertifs > nbMaxCertifs) { nbMaxCertifs = nbCertifs; }
	  
	  // Récupérer les uid des émetteurs des certifications reçus par l'utilisateur
	  // Et stocker les uid et dates d'expiration dans un tableau
	  membersCertifsList[m] = new Array();
	  for (var i=0;i<nbCertifs;i++)
	  {
	    let tmpQueryGetUidIssuerCert = yield duniterServer.dal.peerDAL.query('SELECT `uid` FROM i_index WHERE `pub`=\''+tmpQueryCertifsList[i].issuer+'\' LIMIT 1');
	    let tmpBlockWrittenOn = tmpQueryCertifsList[i].written_on.split("-");
	    
	    // Stoker la liste des certifications
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
		
	// trier les membres par ordre croissant/decroissant du critère sort_by
	var tabSort = [];
	if (sort_by == "expireMembership")
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
	else { contenu += "<p>ERREUR : param <i>sort_by</i> invalid !</p>"; }
	for (var i=0;i<membersList.length;i++)
	{
	  var maxTime = 0;
	  if (order == 'asc') { maxTime = currentTimestamp + (msValidity*2); }
	  var idMaxTime =0;
	  for (var j=0;j<membersList.length;j++) {
	    if ( (order == 'desc' && tabSort[j] > maxTime)
	      || (order == 'asc' && tabSort[j] > 0 && tabSort[j] < maxTime) )
	    {
	      maxTime = tabSort[j];
	      idMaxTime = j;
	    }
	  }

	  membersListOrdered.push({
	        uid: membersList[idMaxTime].uid,
		lastRenewalTimestamp: membershipsTimeList[idMaxTime][0].medianTime,
		lastRenewalWrittenBloc: membershipsBlockNumberList[idMaxTime],
		expireMembershipTimestamp: membershipsExpireTimeList[idMaxTime],
		certifications: membersCertifsList[idMaxTime]
	    });
	  tabSort[idMaxTime] = -1;
	}

	// Si le client demande la réponse au format JSON =, le faire
	if (typeof(req.query.format) != 'undefined' && req.query.format == 'JSON')
	{
	  var response = JSON.stringify(membersListOrdered);
	  
	  // Send JSON reponse
	  res.status(200).send(response);
	}
	else
	{
	  // Afficher le formulaire
	  contenu += '<form action="" method="GET"><input type="number" name="d" value="'+days+'"/>jours';
	  contenu += ' - tri par date <select name="sort_by">';
	  contenu += '<option name="sort_by" value ="expireMembership">d\'expiration du membership';
	  contenu += '<option name="sort_by" value ="lastRenewal"';
	  if (sort_by == 'lastRenewal' ) { contenu += ' selected'; }
	  contenu += '>de dernier renouvellement';
	  contenu += '<option name="sort_by" value ="oldestSig"';
	  if (sort_by == 'oldestSig' ) { contenu += ' selected'; }
	  contenu += '>de plus vielle certification';
	  contenu += '<option name="sort_by" value ="lastSig"';
	  if (sort_by == 'lastSig' ) { contenu += ' selected'; }
	  contenu +='>de plus récente certification';
	  contenu += '</select> dans l\'ordre <select name="order">';
	  contenu += '<option name="order" value ="asc">croissant';
	  contenu += '<option name="order" value ="desc"';
	  if (order == 'desc' ) { contenu += ' selected'; }
	  contenu += '>decroissant</select>';
	  contenu += ' <input type="submit" value="envoyer"></form><br><br>';
		  
	  // Déterminer le timestamp 'd' jours dans le futur
	  var limitTimestamp = currentTimestamp + (days*86400);
		  
		  // On parcour tout les membres pour afficher ceux dont la date d'expiration est dans moins de 'd' jours
		  var nbPrintMembers = 0;
		  contenu += '<b>Membres dont le statut de membre va expirer dans moins de '+days+' jours :</b><table border=1>';
		  for (var i=0;i<membersList.length;i++)
		  {
		    if (membersListOrdered[i]['expireMembershipTimestamp'] < limitTimestamp && membersListOrdered[i]['expireMembershipTimestamp'] > currentTimestamp)
		    {
		      // Printer les nom des colonnes
		      if (nbPrintMembers == 0) {
			contenu += "<tr><td align='center'>uid</td><td align='center' colspan=2>dernier renouvellement + n° bloc</td><td align='center'>expiration membership</td>";
			if (sort_by == 'lastSig') { contenu += "<td align='center' colspan="+nbMaxCertifs+">certifications reçus (n° bloc) [date d'expiration]</td>"; }
			else { contenu += "<td align='center' colspan="+nbMaxCertifs+">certifications reçus (n° bloc) [date d'expiration]</td>"; }
			contenu += "</tr>";
		      }
		      // Convertir timestamp en date
		      let tmpDateLastRenewal = new Date(membersListOrdered[i]['lastRenewalTimestamp']*1000);
		      let tmpDateExpire = new Date((membersListOrdered[i]['expireMembershipTimestamp'])*1000);
		      
		      // Calculer la proportion de membership restant (en pour 255ème)
		      let membershipProportion = ((membersListOrdered[i]['expireMembershipTimestamp']-currentTimestamp)*255)/msValidity;
		      
		      // Calculer la couleur à attribuer à cette ligne (dégradé du vert au rouge)
		      let color="";
			let tmpRed = 255-(membershipProportion);
			if ( tmpRed < 16 ) { color = "0"; }
			color += parseInt(tmpRed).toString(16);
			let tmpGreen = (membershipProportion);
			if ( tmpGreen < 16 ) { color += "0"; }
			color += parseInt(tmpGreen).toString(16);
		      color += "00";

		      // Printer la ligne
		      contenu += "<tr><td align='center' style=\"background:#"+color+"\">"+membersListOrdered[i]['uid']
			+"</td><td align='center' style=\"background:#"+color+"\">"+timestampToDatetime(membersListOrdered[i]['lastRenewalTimestamp'])
			+"</td><td align='center' style=\"background:#"+color+"\">"+membersListOrdered[i]['lastRenewalWrittenBloc']
			+"</td><td align='center' style=\"background:#"+color+"\">"
			+timestampToDatetime(membersListOrdered[i]['expireMembershipTimestamp'])+"</td>";

		      for (let j=0;j<membersListOrdered[i]['certifications'].length;j++)
		      {
			// Calculer la proportion de temps restant avant expiration de la certification(en pour 255ème)
			let sigProportion = ((membersListOrdered[i]['certifications'][j]['timestampExpire']-currentTimestamp)*255)/sigValidity;
			
			// calculer la couleur à attribué à cette certification (dégradé du vert au rouge)
			let colorSig="";
			let tmpRedSig = 255-(sigProportion);
			if ( tmpRedSig < 16 ) { colorSig = "0"; }
			  colorSig += parseInt(tmpRedSig).toString(16);
			let tmpGreenSig = (sigProportion);
			if ( tmpGreenSig < 16 ) { colorSig += "0"; }
			  colorSig += parseInt(tmpGreenSig).toString(16);
		        colorSig += "00";
			
			// Printer la certification
			contenu += "<td align='center' style=\"background:#"+colorSig+"\">"+membersListOrdered[i]['certifications'][j]['issuer']
			+" (bloc#"+membersListOrdered[i]['certifications'][j]['writtenBloc']+") ["
			+timestampToDatetime(membersListOrdered[i]['certifications'][j]['timestampExpire'])+"]</td>";
		      }
		      contenu += "</tr>";
		      nbPrintMembers++;
		    }
		  }
		  contenu += "<tr><td colspan="+(4+nbMaxCertifs)+" align='center'> total : <b>"+nbPrintMembers+"</b> membres.</td><t/tr></table><br><hr>";

		  // Send html page
		  res.status(200).send('<pre>' + (contenu) + '</pre>');
	}
    } catch (e) {
	// En cas d'exception, afficher le message
	res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
    
  }));
  
  /****************************************
  * Lister les anciens membres
  ***************************************/
  
  app.get('/wasMembers', (req, res) => co(function *() {
    try {
      // get current timestamp
      const currentDate = new Date();
      const currentTimestamp = Math.round(currentDate.getTime() / 1000);
      
      // Initaliser les variables
      var contenu = "";
      var nbExpirMembers = 0;
      var membershipsTimeList = [];
      var membershipsBlockNumberList = [];
      var membershipsExpireTimeList = [];
      
      // Récupérer les paramètres
      var order = 'asc'; // Valeur par défaut
      if (req.query.order == 'desc') {
	order = 'desc';
      }
      console.log(req.query);
      
        // Récupérer la liste des identités ayant déjà eu le statut de membre au moins 1 fois
	const membersList = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`pub`,`member` FROM i_index WHERE `wasMember`=1');
	// Récupérer pour chaque identité, le numéro du block d'écriture du dernier membership
	for (const member of membersList) {
	  let tmpQueryResult = yield duniterServer.dal.peerDAL.query(
	      'SELECT `written_on`,`expires_on` FROM m_index WHERE `pub`=\''+member.pub+'\' ORDER BY `written_on` DESC LIMIT 1');
	    membershipsExpireTimeList.push(tmpQueryResult[0].expires_on);
	  let tmpArray = tmpQueryResult[0].written_on.split("-"); // Separate blockNumber and blockHash
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
		
	// trier les membres par ordre croissant/decroissant de membershipsExpireTimeList
	for (var i=0;i<membersList.length;i++) {
	  var maxTime = 0;
	  if (order == 'asc') { maxTime = currentTimestamp + (msValidity*2); }
	  var idMaxTime =0;
	  for (var j=0;j<membersList.length;j++) {
	    if ( (order == 'desc' && membershipsExpireTimeList[j] > maxTime)
	      || (order == 'asc' && membershipsExpireTimeList[j] < maxTime) )
	    {
	      maxTime = membershipsExpireTimeList[j];
	      idMaxTime = j;
	    }
	  }

	  if (i > 0) {
	    membersListOrdered.push([membersList[idMaxTime].uid,
		membershipsTimeList[idMaxTime][0].medianTime,
		membershipsBlockNumberList[idMaxTime],
		membershipsExpireTimeList[idMaxTime],
		membersList[idMaxTime].member]);
	  } else {
	    membersListOrdered[i][0] =  membersList[idMaxTime].uid;
	    membersListOrdered[i][1] =  membershipsTimeList[idMaxTime][0].medianTime;
	    membersListOrdered[i][2] =  membershipsBlockNumberList[idMaxTime];
	    membersListOrdered[i][3] =  membershipsExpireTimeList[idMaxTime];
	    membersListOrdered[i][4] = membersList[idMaxTime].member;
	  }
		  
	  membershipsExpireTimeList[idMaxTime] = -1;
	  if (order == 'asc') { membershipsExpireTimeList[idMaxTime] = currentTimestamp + (msValidity)*2; }
	}
	
	// On parcour tout les membres pour afficher ceux qui ont expirer
	nbExpirMembers = 0;
	contenu += '<b>Membres dont le statut de membre à déjà expirer :</b><br><table border=1>';
	for (var i=0;i<membersList.length;i++) {
	  if (membersListOrdered[i][3] < currentTimestamp && membersListOrdered[i][4] == 0) {
	    // Printer les nom des colonnes
	    if (nbExpirMembers == 0) {
	      contenu += "<tr><td align='center'>uid</td><td align='center'> date dernier renouvellement </td><td align='center'> blockNumber </td><td align='center'> date d'expiration </td></tr>";
	    }
	    // Convertir timestamp en date
	    var tmpDateLastRenewal = new Date(membersListOrdered[i][1]*1000);
	    var tmpDateExpire = new Date((membersListOrdered[i][3])*1000);
	    contenu += "<tr><td align='center'>"+membersListOrdered[i][0]+"</td><td align='center'>"+tmpDateLastRenewal.getDate()+"/"
	      +(tmpDateLastRenewal.getMonth()+1)+"/"+tmpDateLastRenewal.getFullYear()+" "
	      +tmpDateLastRenewal.getHours()+":"+tmpDateLastRenewal.getMinutes()+":"+tmpDateLastRenewal.getSeconds()
	      +"</td><td align='center'>"
	      +membersListOrdered[i][2]+"</td><td align='center'>"
	      +tmpDateExpire.getDate()+"/"+(tmpDateExpire.getMonth()+1)+"/"+tmpDateExpire.getFullYear()+" "
	      +tmpDateExpire.getHours()+":"+tmpDateExpire.getMinutes()+":"+tmpDateExpire.getSeconds()+"</td></tr>";
	    nbExpirMembers++;
	  }
	}
	contenu += "<tr><td align='center' colspan=4> total : <b>"+nbExpirMembers+"</b> membres.</td><t/tr></table><br><hr>";

	// Send html page
	res.status(200).send('<pre>' + (contenu) + '</pre>');
    } catch (e) {
	// En cas d'exception, afficher le message
	res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
   }));

  let httpServer = http.createServer(app);
  //httpServer.on('connection', function(socket) {
  //});
  httpServer.on('error', function(err) {
    httpServer.errorPropagates(err);
  });
  
  return {
    openConnection: () => co(function *() {
      try {
        yield Q.Promise((resolve, reject) => {
          // Weird the need of such a hack to catch an exception...
          httpServer.errorPropagates = function(err) {
            reject(err);
          };

          httpServer.listen(port, host, (err) => {
            if (err) return reject(err);
            resolve(httpServer);
          });
        });
        console.log('Server listening on http://' + host + ':' + port);
      } catch (e) {
        console.warn('Could NOT listen to http://' + host + ':' + port);
        console.warn(e);
      }
    }),
  };
};
