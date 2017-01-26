"use strict";

const Q = require('q');
const _ = require('underscore');
const co = require('co');
const http = require('http');
const morgan = require('morgan');
const express = require('express');
const bodyParser = require('body-parser');

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
      var membersCertifsList = [ [] ];
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
	    
	    // Convertir le timestamp d'écriture en datetime
	    let tmpDateTimeExpireCertif = new Date((tmpQueryCertifsList[i].expires_on)*1000);//tmpQueryGetTimeWrittenCert[0].medianTime)*1000);
	    let tmpDateTimeExpireCertifDay = tmpDateTimeExpireCertif.getDate();
	    if (tmpDateTimeExpireCertifDay < 10 ) { tmpDateTimeExpireCertifDay = "0"+tmpDateTimeExpireCertifDay; }
	    let tmpDateTimeExpireCertifMonth = tmpDateTimeExpireCertif.getMonth()+1;
	    if (tmpDateTimeExpireCertifMonth < 10 ) { tmpDateTimeExpireCertifMonth = "0"+tmpDateTimeExpireCertifMonth; }
	    
	    // Formater les heures
	    let tmpDateTimeExpireCertifhours = tmpDateTimeExpireCertif.getHours();
	    if (tmpDateTimeExpireCertifhours < 10 ) { tmpDateTimeExpireCertifhours = "0"+tmpDateTimeExpireCertifhours; }
	    let tmpDateTimeExpireCertifMinutes = tmpDateTimeExpireCertif.getMinutes();
	    if (tmpDateTimeExpireCertifMinutes < 10 ) { tmpDateTimeExpireCertifMinutes = "0"+tmpDateTimeExpireCertifMinutes; }
	    let tmpDateTimeExpireCertifSeconds = tmpDateTimeExpireCertif.getSeconds();
	    if (tmpDateTimeExpireCertifSeconds < 10 ) { tmpDateTimeExpireCertifSeconds = "0"+tmpDateTimeExpireCertifSeconds; }
	    
	    // Stoker la liste des certifications
	    if (i == 0)
	    {
	      membersIssuerFirstCertif.push(tmpQueryGetUidIssuerCert[0].uid);
	      membersFirstCertifExpire.push(tmpQueryCertifsList[0].expires_on);
	      
	      membersCertifsList[m][0] = tmpQueryGetUidIssuerCert[0].uid+"  (bloc#"+tmpBlockWrittenOn[0]+") ["
	        +tmpDateTimeExpireCertifDay+"/"+tmpDateTimeExpireCertifMonth+"/"+tmpDateTimeExpireCertif.getFullYear()+" "
	        +tmpDateTimeExpireCertifhours+":"+tmpDateTimeExpireCertifMinutes+":"+tmpDateTimeExpireCertifSeconds+"]";
	    }
	    else
	    {
	      membersCertifsList[m].push(tmpQueryGetUidIssuerCert[0].uid+"  (bloc#"+tmpBlockWrittenOn[0]+") ["
	        +tmpDateTimeExpireCertifDay+"/"+tmpDateTimeExpireCertifMonth+"/"+tmpDateTimeExpireCertif.getFullYear()+" "
	        +tmpDateTimeExpireCertifhours+":"+tmpDateTimeExpireCertifMinutes+":"+tmpDateTimeExpireCertifSeconds+"]"
	      );
	    }
	  }
	  //if (membersCertifsList.length > 0) { membersCertifsList.push(tabAllCertifsOfCurrentmember); }
	  //else { membersCertifsList[0] = tabAllCertifsOfCurrentmember; }
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
		
	// Initialiser le tableau membersListOrdered et membersSorted
	var membersListOrdered = [ [] ];
	var membersSorted = [];
		
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
	for (var i=0;i<membersList.length;i++) {
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

	  if (i > 0) {
	    membersListOrdered.push([membersList[idMaxTime].uid,
		membershipsTimeList[idMaxTime][0].medianTime,
		membershipsBlockNumberList[idMaxTime],
		membershipsExpireTimeList[idMaxTime]]
 				  );
	      membersSorted.push(idMaxTime);
	  } else {
	    membersListOrdered[i][0] =  membersList[idMaxTime].uid;
	    membersListOrdered[i][1] =  membershipsTimeList[idMaxTime][0].medianTime;
	    membersListOrdered[i][2] =  membershipsBlockNumberList[idMaxTime];
	    membersListOrdered[i][3] =  membershipsExpireTimeList[idMaxTime];
	    membersSorted[0] = idMaxTime;
	  }
	  tabSort[idMaxTime] = -1;
	}
		
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
		for (var i=0;i<membersList.length;i++) {
		  if (membersListOrdered[i][3] < limitTimestamp && membersListOrdered[i][3] > currentTimestamp) {
		    // Printer les nom des colonnes
		    if (nbPrintMembers == 0) {
		      contenu += "<tr><td align='center'>uid</td><td align='center' colspan=2>dernier renouvellement + n° bloc</td><td align='center'>expiration membership</td>";
		      if (sort_by == 'lastSig') { contenu += "<td align='center' colspan="+nbMaxCertifs+">certifications reçus (n° bloc) [date d'expiration]</td>"; }
		      else { contenu += "<td align='center' colspan="+nbMaxCertifs+">certifications reçus (n° bloc) [date d'expiration]</td>"; }
		      contenu += "</tr>";
		    }
		    // Convertir timestamp en date
		    let tmpDateLastRenewal = new Date(membersListOrdered[i][1]*1000);
		    let tmpDateExpire = new Date((membersListOrdered[i][3])*1000);
		    
		    // Calculer la proportion de membership restant (en pour 255ème)
		    let membershipProportion = ((membersListOrdered[i][3]-currentTimestamp)*255)/msValidity;
		    
		    // Calculer la couleur à attribuer à cette ligne (dégradé du vert au rouge)
		    let color="";
		      let tmpRed = 255-(membershipProportion);
		      if ( tmpRed < 16 ) { color = "0"; }
		      color += parseInt(tmpRed).toString(16);
		      let tmpGreen = (membershipProportion);
		      if ( tmpGreen < 16 ) { color += "0"; }
		      color += parseInt(tmpGreen).toString(16);
		    color += "00";
		    
		    // Formater les dates
		    let tmpDateLastRenewalDay = tmpDateLastRenewal.getDate();
		    if (tmpDateLastRenewalDay < 10 ) { tmpDateLastRenewalDay = "0"+tmpDateLastRenewalDay; }
		    let tmpDateLastRenewalMonth = tmpDateLastRenewal.getMonth()+1;
		    if (tmpDateLastRenewalMonth < 10 ) { tmpDateLastRenewalMonth = "0"+tmpDateLastRenewalMonth; }
		    let tmpDateExpireDay = tmpDateExpire.getDate();
		    if (tmpDateExpireDay < 10 ) { tmpDateExpireDay = "0"+tmpDateExpireDay; }
		    let tmpDateExpireMonth = tmpDateExpire.getMonth()+1;
		    if (tmpDateExpireMonth < 10 ) { tmpDateExpireMonth = "0"+tmpDateExpireMonth; }
		    
		    // Formater les heures
		    let tmpDateLastRenewalhours = tmpDateLastRenewal.getHours();
		    if (tmpDateLastRenewalhours < 10 ) { tmpDateLastRenewalhours = "0"+tmpDateLastRenewalhours; }
		    let tmpDateLastRenewalMinutes = tmpDateLastRenewal.getMinutes();
		    if (tmpDateLastRenewalMinutes < 10 ) { tmpDateLastRenewalMinutes = "0"+tmpDateLastRenewalMinutes; }
		    let tmpDateLastRenewalSeconds = tmpDateLastRenewal.getSeconds();
		    if (tmpDateLastRenewalSeconds < 10 ) { tmpDateLastRenewalSeconds = "0"+tmpDateLastRenewalSeconds; }
		    let tmpDateExpireHours = tmpDateExpire.getHours();
		    if (tmpDateExpireHours < 10 ) { tmpDateExpireHours = "0"+tmpDateExpireHours; }
		    let tmpDateExpireMinutes = tmpDateExpire.getMinutes();
		    if (tmpDateExpireMinutes < 10 ) { tmpDateExpireMinutes = "0"+tmpDateExpireMinutes; }
		    let tmpDateExpireSeconds = tmpDateExpire.getSeconds();
		    if (tmpDateExpireSeconds < 10 ) { tmpDateExpireSeconds = "0"+tmpDateExpireSeconds; }
		    // Printer la ligne
		    contenu += "<tr style=\"background:#"+color+"\"><td align='center'>"+membersListOrdered[i][0]
		      +"</td><td align='center'>"+tmpDateLastRenewalDay+"/"+tmpDateLastRenewalMonth+"/"+tmpDateLastRenewal.getFullYear()
		      +" "+tmpDateLastRenewalhours+":"+tmpDateLastRenewalMinutes+":"+tmpDateLastRenewalSeconds
		      +"</td><td align='center'>"+membersListOrdered[i][2]+"</td><td align='center'>"+tmpDateExpireDay+"/"
		      +tmpDateExpireMonth+"/"+tmpDateExpire.getFullYear()+" "+tmpDateExpireHours+":"
		      +tmpDateExpireMinutes+":"+tmpDateExpireSeconds+"</td>";
		    for (let j=0;j<membersCertifsList[membersSorted[i]].length;j++)
		    {
		      contenu += "<td align='center'>"+membersCertifsList[membersSorted[i]][j]/*membersCertifsList[i][j]*/+"</td>";
		        /*+membersListOrdered[i][5]+" "
		        +tmpDateCertifDay+"/"+tmpDateCertifMonth+"/"+tmpDateCertif.getFullYear()+" "+tmpDateCertifHours+":"
		        +tmpDateCertifMinutes+":"+tmpDateCertifSeconds*/
		    }
		    contenu += "</tr>";
		    nbPrintMembers++;
		  }
		}
		contenu += "<tr><td colspan="+(4+nbMaxCertifs)+" align='center'> total : <b>"+nbPrintMembers+"</b> membres.</td><t/tr></table><br><hr>";

	// Send html page
	res.status(200).send('<pre>' + (contenu) + '</pre>');
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
