"use strict";

const Q = require('q');
const _ = require('underscore');
const co = require('co');
const http = require('http');
const morgan = require('morgan');
const express = require('express');
const bodyParser = require('body-parser');

const fsreadline = require('./fs-readline.js');

const blockChart = require('./blockChart.js');

function timestampToDatetime(timestamp) {
	    // Convertir le timestamp en datetime
	    let tmptimestampExpireCertif = new Date(timestamp*1000);//tmpQueryGetTimeWrittenCert[0].medianTime)*1000);
	    let tmptimestampExpireCertifDay = tmptimestampExpireCertif.getDate();
	    if (tmptimestampExpireCertifDay < 10 ) { tmptimestampExpireCertifDay = "0"+tmptimestampExpireCertifDay; }
	    let tmptimestampExpireCertifMonth = tmptimestampExpireCertif.getMonth()+1;
	    if (tmptimestampExpireCertifMonth < 10 ) { tmptimestampExpireCertifMonth = "0"+tmptimestampExpireCertifMonth; }
	    
	    // Formater les heures et minutes
	    let tmptimestampExpireCertifhours = tmptimestampExpireCertif.getHours();
	    if (tmptimestampExpireCertifhours < 10 ) { tmptimestampExpireCertifhours = "0"+tmptimestampExpireCertifhours; }
	    let tmptimestampExpireCertifMinutes = tmptimestampExpireCertif.getMinutes();
	    if (tmptimestampExpireCertifMinutes < 10 ) { tmptimestampExpireCertifMinutes = "0"+tmptimestampExpireCertifMinutes; }
	    //let tmptimestampExpireCertifSeconds = tmptimestampExpireCertif.getSeconds();
	    //if (tmptimestampExpireCertifSeconds < 10 ) { tmptimestampExpireCertifSeconds = "0"+tmptimestampExpireCertifSeconds; }

	    var stringDateTime = tmptimestampExpireCertifDay+"/"+tmptimestampExpireCertifMonth+"/"+(tmptimestampExpireCertif.getFullYear()).toString().substring(2, 4)+" "
		  +tmptimestampExpireCertifhours+":"+tmptimestampExpireCertifMinutes;//+":"+tmptimestampExpireCertifSeconds;
		  
    return stringDateTime;
}

module.exports = (host, port, duniterServer, sigValidity, msValidity, sigWindow, idtyWindow) => {

  var app = express();

  app.use(morgan('\x1b[90m:remote-addr :remote-user [:date[clf]] :method :url HTTP/:http-version :status :res[content-length] - :response-time ms\x1b[0m', {
    stream: {
      write: function(message){
        message && console.log(message.replace(/\n$/,''));
      }
    }
  }));
  app.use(bodyParser.urlencoded({ extended: true }));
  
  /****************************************
  * Lister les futurs membres
  ***************************************/
  
  app.get('/willMembers', (req, res) => co(function *() {
    //var willMembersMod=willMembers.willMembers_(req, res, duniterServer, sigValidity, msValidity, sigWindow, idtyWindow);
    try {
      // get blockchain timestamp
      let resultQueryCurrentBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`number` FROM block ORDER BY `medianTime` DESC LIMIT 1 ');
      const currentBlockchainTimestamp = resultQueryCurrentBlock[0].medianTime;
      const currentBlockNumber = resultQueryCurrentBlock[0].number;
      
      // Initaliser les variables
      var contenu = "";
      var identitiesList = [];
      var idtysPendingCertifsList = [ [ [] ] ];
      
      // Récupéré les paramètres
      var days = 0;
      if( typeof(req.query.d) == 'undefined' ) {
        days = 65; // Valeur par défaut
      } else {
	  days = req.query.d;
      }
      var order = 'asc'; // Valeur par défaut
      if (typeof(req.query.d) != 'undefined' && req.query.order == 'desc') {
	order = 'desc';
      }
      var sort_by="creationIdty"; // Valeur par défaut
      if (typeof(req.query.sort_by) != 'undefined') {
	sort_by = req.query.sort_by;
      }
      var hideIdtyWithZeroCert="no"; // Valeur par défaut
      if (typeof(req.query.hideIdtyWithZeroCert) != 'undefined') {
	hideIdtyWithZeroCert = req.query.hideIdtyWithZeroCert;
      }
      var sortSig = "Creation"; // Valeur par défaut
      if (typeof(req.query.sortSig) != 'undefined') {
	sortSig = req.query.sortSig;
      }
      var lg="fr"; // Valeur par défaut
      if (typeof(req.query.lg) != 'undefined') {
	lg = req.query.lg;
      }
      console.log(req.query);
      
      // Récupérer la liste des identités en piscine
      const resultQueryIdtys = yield duniterServer.dal.peerDAL.query('SELECT `buid`,`pubkey`,`uid`,`hash`,`expires_on` FROM identities_pending WHERE `member`=0');
      
      // Récupérer pour chaque identité, l'ensemble des certifications qu'elle à reçue.
      var nbMaxCertifs = 0;
      for (let i=0;i<resultQueryIdtys.length;i++)
      {
	  // Extraire le numéro de bloc d'émission de l'identité
	  let idtyBlockStamp = resultQueryIdtys[i].buid.split("-");
	  let idtyBlockNumber = idtyBlockStamp[0];
	  
	  // récupérer le medianTime du bloc d'émission de l'identité
	  let resultQueryTimeCreateIdty = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `number`=\''+idtyBlockNumber+'\' LIMIT 1');
	  
	  // récupérer l'ensemble des certifications en attente destinées à l'identité courante
	  let tmpQueryPendingCertifsList = yield duniterServer.dal.peerDAL.query(
		'SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\''+resultQueryIdtys[i].pubkey+'\' AND `target`=\''+resultQueryIdtys[i].hash+'\' ORDER BY `expires_on` DESC');
	  
	  // Calculer le nombre de certifications en attentes destinées au membre courant
	  let nbPendingCertifs = tmpQueryPendingCertifsList.length;
	  let nbValidPendingCertifs = 0;
	    
	  // Récupérer les uid des émetteurs des certifications reçus par l'utilisateur
	  // Et stocker les uid et dates d'expiration dans un tableau
	  idtysPendingCertifsList[i] = new Array();
	  for (var j=0;j<nbPendingCertifs;j++)
	  {
	    let tmpQueryGetUidIssuerPendingCert = yield duniterServer.dal.peerDAL.query('SELECT `uid` FROM i_index WHERE `pub`=\''+tmpQueryPendingCertifsList[j].from+'\' LIMIT 1');
	    // Vérifier que l'émetteur de la certification correspond à une identité inscrite en blockchain
	    if ( tmpQueryGetUidIssuerPendingCert.length > 0 )
	    {
	      // récupérer le timestamp d'enchainement de la dernière certification écrite par l'émetteur
	      let tmpQueryLastIssuerCert = yield duniterServer.dal.peerDAL.query('SELECT `chainable_on` FROM c_index WHERE `issuer`=\''+tmpQueryPendingCertifsList[j].from+'\' ORDER BY `chainable_on` DESC LIMIT 1');
	      let certTimestampWritable = 0;
	      if ( typeof(tmpQueryLastIssuerCert[0]) != 'undefined' && typeof(tmpQueryLastIssuerCert[0].chainable_on) != 'undefined' )
	      { certTimestampWritable = tmpQueryLastIssuerCert[0].chainable_on; }
	      
	      // Vérifier si le blockstamp est correct
	      var validBlockStamp = false;
	      let tmpBlockHash = yield duniterServer.dal.peerDAL.query('SELECT `hash` FROM block WHERE `number`=\''+tmpQueryPendingCertifsList[j].block_number+'\' AND `fork`=0 LIMIT 1');
	      if (tmpBlockHash[0].hash == tmpQueryPendingCertifsList[j].block_hash)
	      {
		validBlockStamp = true;
	      }
	      
		// Vérifier que l'identité courant n'a pas déjà reçu d'autre(s) certification(s) de la part du même membre ET dans le même état de validité du blockstamp
		let doubloonPendingCertif = false;
		for (const idtyPendingCertifsList of idtysPendingCertifsList[i])
		{
		  if (idtyPendingCertifsList.from == tmpQueryGetUidIssuerPendingCert[0].uid && idtyPendingCertifsList.validBlockStamp == validBlockStamp)
		  {
		    doubloonPendingCertif = true;
		  }
		}
		if (!doubloonPendingCertif)
		{
		  // Stoker la liste des certifications en piscine qui n'ont pas encore expirées
		  if (tmpQueryPendingCertifsList[j].expires_on > currentBlockchainTimestamp)
		  {
			idtysPendingCertifsList[i].push({
			    from: tmpQueryGetUidIssuerPendingCert[0].uid,
			    blockNumber: tmpQueryPendingCertifsList[j].block_number,
			    timestampExpire: tmpQueryPendingCertifsList[j].expires_on,
			    timestampWritable: certTimestampWritable,
			    validBlockStamp: validBlockStamp
			});
			nbValidPendingCertifs++;
		  }
		}
	      
	    }
	  }

	    // Stocker les informations de l'identité
	    identitiesList.push({
	        BlockNumber: idtyBlockNumber,
		creationTimestamp: resultQueryTimeCreateIdty[0].medianTime,
	        pubkey: resultQueryIdtys[i].pubkey,
		uid: resultQueryIdtys[i].uid,
		hash: resultQueryIdtys[i].hash,
		expires_on: resultQueryIdtys[i].expires_on
	    });
	  
	  // Calculer le nombre maximal de certifications reçus par l'identité courante
	  if ( nbValidPendingCertifs > nbMaxCertifs) { nbMaxCertifs = nbValidPendingCertifs; }
      }
      
      // Si demandé, retrier les, certifications par date de disponibilité
        if (sortSig == "Availability")
	{ 
	  var idtysPendingCertifsListSort = [ [] ];
	  for (var i=0;i<idtysPendingCertifsList.length;i++)
	  {
	    idtysPendingCertifsListSort[i] = Array();
	    let min;
	    let idMin =0;
	    let tmpExcluded = Array();
	    for (let j=0;j<idtysPendingCertifsList[i].length;j++) { tmpExcluded[j] = false; }
	    for (let j=0;j<idtysPendingCertifsList[i].length;j++)
	    {
	      min = currentBlockchainTimestamp+sigValidity; // begin to min = max
	      
	      // search idMin (id of certif with min timestampWritable)
	      for (let k=0;k<idtysPendingCertifsList[i].length;k++)
	      {
		if (idtysPendingCertifsList[i][k].timestampWritable < min && !tmpExcluded[k])
		{
		  min = idtysPendingCertifsList[i][k].timestampWritable;
		  idMin = k;
		}
	      }
	    
	      // Push min value on sort table
	      idtysPendingCertifsListSort[i].push({
			  from: idtysPendingCertifsList[i][idMin].from,
			  blockNumber: idtysPendingCertifsList[i][idMin].blockNumber,
			  timestampExpire: idtysPendingCertifsList[i][idMin].timestampExpire,
			  timestampWritable: idtysPendingCertifsList[i][idMin].timestampWritable,
			  validBlockStamp: idtysPendingCertifsList[i][idMin].validBlockStamp
	      });
	  
	      // Exclure la valeur min avant de poursuivre le tri
	      tmpExcluded[idMin] = true;
	    }
	  }
	  idtysPendingCertifsList = idtysPendingCertifsListSort;
	}
      
      // Initialiser le tableau idtysListOrdered
      var idtysListOrdered = [ [] ];

      // Calculer le timestamp limite à prendre en compte
      var limitTimestamp = currentBlockchainTimestamp + (days*86400);
		
      // Récupérer la valeur du critère de tri pour chaque identité
      var tabSort = [];
	if (sort_by == "creationIdty")
	{ 
	  for (const idty of identitiesList)
	  { tabSort.push(idty.expires_on); }
	}
	else if (sort_by == "sigCount")
	{ 
	  for (const idtyPendingCertifsList of idtysPendingCertifsList)
	  {
	    tabSort.push(idtyPendingCertifsList.length);
	  }
	}
	else { contenu += "<p>ERREUR : param <i>sort_by</i> invalid !</p>"; }
      
      // Trier les identités par ordre decroissant du critère sort_by
      for (var i=0;i<identitiesList.length;i++)
      {
	  let max = -1;
	  let idMax =0;
	  for (var j=0;j<identitiesList.length;j++) {
	    if (tabSort[j] > max)
	    {
	      max = tabSort[j];
	      idMax = j;
	    }
	  }
	  
	  // Push max value on sort table, only if respect days limit
	  if (limitTimestamp > identitiesList[idMax].expires_on)
	  {
	    // Vérifier que cette identité n'a pas déjà été prise en compte (empecher les doublons)
	    let doubloon = false;
	    for (const idty of idtysListOrdered)
	    {
	      if (identitiesList[idMax].uid == idty.uid && identitiesList[idMax].BlockNumber == idty.BlockNumber)
	      { doubloon = true; }
	    }
	    
	    // Push max value on sort table
	    if (!doubloon)
	    {
	      idtysListOrdered.push({
		  uid: identitiesList[idMax].uid,
		  creationTimestamp: identitiesList[idMax].creationTimestamp,
		  pubkey: identitiesList[idMax].pubkey,
		  BlockNumber: identitiesList[idMax].BlockNumber,
		  expires_on: identitiesList[idMax].expires_on,
		  pendingCertifications: idtysPendingCertifsList[idMax]
	      });
	    }
	  }
	  // Exclure la valeur max avant de poursuivre le tri
	  tabSort[idMax] = -1;
      }
      
      // Si ordre croissant demandé, inverser le tableau
      if (order == 'asc')
      {
	var idtysListOrdered2 = [ [] ];
	let tmpIdtysListOrderedLength = idtysListOrdered.length;
	for (let i=0;i<tmpIdtysListOrderedLength;i++)
	{
	  idtysListOrdered2[i] = idtysListOrdered[tmpIdtysListOrderedLength-i-1];
	}
	idtysListOrdered = idtysListOrdered2;
      }
      
      // Si le client demande la réponse au format JSON =, le faire
      if (typeof(req.query.format) != 'undefined' && req.query.format == 'JSON')
      {
	  var response = JSON.stringify(idtysListOrdered);
	  
	  // Send JSON reponse
	  res.status(200).send(response);
      }
      // Sinon, printer le tableau html
      else
      {
	  // Récupérer le fichier de langue
	  var tabTxt = [];
	  var lgfile="./lg/willMembers_"+lg+".txt"
	  var r=fsreadline.fopen(lgfile,"r")
	  if(r===false)
	  {
	    console.log("Error, can't open ", lgfile);
	  }
	  else
	  {
	    //let count=0;
	    do
	    {
	      var line=fsreadline.fgets(r);
	      //console.log(line);
	      let tmp = line.toString().split(" ");
	      tabTxt[tmp[0]] = line.toString().substring(tmp[0].length+1, line.length);
	      //count+=1
	    }
	    while (!fsreadline.eof(r))
	    fsreadline.fclose(r);
	  }
	
	// Afficher le formulaire
	  contenu += '<form action="" method="GET"><input type="number" name="d" value="'+days+'"/>'+tabTxt["DAYS"];
	  contenu += ' - '+tabTxt["SORT_BY"]+' <select name="sort_by">';
	  contenu += '<option name="sort_by" value ="creationIdty">'+tabTxt["SORT_BY_CREATION_IDTY"];
	  contenu += '<option name="sort_by" value ="sigCount"';
	  if (sort_by == 'sigCount' ) { contenu += ' selected'; }
	  contenu +='>'+tabTxt["SORT_BY_SIG_COUNT"];
	  contenu += '</select> '+tabTxt["ORDER"]+' <select name="order">';
	  contenu += '<option name="order" value ="asc">'+tabTxt["ORDER_ASC"];
	  contenu += '<option name="order" value ="desc"';
	  if (order == 'desc' ) { contenu += ' selected'; }
	  contenu += '>'+tabTxt["ORDER_DESC"]+'</select>';
	  contenu += ' <input type="submit" value="'+tabTxt["SUBMIT_TXT"]+'">';
	  contenu += '<div align="right"><select name="lg"><option name="lg" value="fr">FR';
	  contenu += '<option name="lg" value="en"';
	  if (lg == 'en' ) { contenu += ' selected'; }
	  contenu += '>EN</select></div><br>';
	  
	  contenu += '<input type="checkbox" name="hideIdtyWithZeroCert" value="yes"';
	  if (hideIdtyWithZeroCert == 'yes' ) { contenu += ' checked'; }
	  contenu += '>'+tabTxt["CHECKBOX_HIDE_IDTY_WITH_ZERO_CERT"]+'<br>';
	  
	  contenu += '<input type="checkbox" name="sortSig" value="Availability"';
	  if (sortSig == 'Availability' ) { contenu += ' checked'; }
	  contenu += '>'+tabTxt["CHECKBOX_SORT_SIG"]+'</form><br>';
	  
	  
	  // Afficher le currentBlockchainTimestamp et la légende
	  contenu += '<i><font color=\'DarkRed\'>'+tabTxt["SIG_PERIOD_LEGEND"]+'</font><br>';
	  contenu += '<font color=\'green\'>'+tabTxt["SIG_PERIOD_LEGEND2"]+'</font></i><br><br>';
	  contenu += '<b>'+tabTxt["HOW_TO_BECOME_MEMBER_TITLE"]+'</b><br>';
	  contenu += tabTxt["HOW_TO_BECOME_MEMBER_TEXT"];
	  contenu += '<br>';
	  contenu += '<b>'+tabTxt["DISTANCE_RULE_TITLE"]+'</b><br>';
	  contenu += tabTxt["DISTANCE_RULE_TXT"];
	  contenu += '<br>';
	  contenu += '<div align="right"><a href="https://github.com/librelois/duniter-special-node-members/blob/master/LICENSE">'+tabTxt["LICENSE"]+'</a><br>';
	  contenu += '<a href="https://github.com/librelois/duniter-special-node-members/">'+tabTxt["SRC"]+'</a></div><br>';
	  contenu += '<b>'+tabTxt["BLOCKCHAIN_TIME"]+' : '+timestampToDatetime(currentBlockchainTimestamp)+'</b> ';
	  contenu += '(<b>#'+currentBlockNumber+'</b>). ';
	  
	  // On parcour toutes les identités
	  var nbPrintMembers = 0;
	  contenu += tabTxt["TABLE_TITLE1"]+' <b>'+days+'</b> '+tabTxt["TABLE_TITLE2"]+' :<table border=1>';
	  for (var i=0;i<idtysListOrdered.length;i++)
	  {
	    if (idtysListOrdered[i]['expires_on'] < limitTimestamp && idtysListOrdered[i]['expires_on'] > currentBlockchainTimestamp
	      && (hideIdtyWithZeroCert != "yes" || idtysListOrdered[i]['pendingCertifications'].length > 0) )
	    {
	      // Printer les nom des colonnes
	      if (nbPrintMembers == 0) {
		contenu += "<tr><td align='center'>"+tabTxt['COL_1']+"</td><td align='center'>"+tabTxt['COL_2']+"</td>";
		contenu += "<td align='center'>"+tabTxt['COL_3']+"</td><td style=\"background:#000000\">-</td>";
		if (sortSig == "Availability")
		{ contenu += "<td align='left' colspan="+nbMaxCertifs+">"+tabTxt['COL_4_WITH_AVAIlABILITY_SORT']+"</td>"; }
		else
		{ contenu += "<td align='left' colspan="+nbMaxCertifs+">"+tabTxt['COL_4']+"</td>"; }
		contenu += "</tr>";
	      }
		      
	      // Calculer la proportion de temps restant avant l'expiration de l'identité (en pour 200ème)
	      let idtyProportion = ((idtysListOrdered[i]['expires_on']-currentBlockchainTimestamp)*200)/idtyWindow;
	      if (idtyProportion < 0 ) { idtyProportion = 0; }
	      else if (idtyProportion > 200 ) { idtyProportion = 200; }
		      
	      let colorPendingIdty = "#"+parseInt(idtyProportion).toString(16)
		+parseInt(idtyProportion).toString(16)+parseInt(idtyProportion).toString(16);
		
	      // Printer la ligne
	      contenu += "<tr><td align='center' style=\"background:"+colorPendingIdty+"\"><a href=\"http://wotex.cgeek.fr/?to="
	        +idtysListOrdered[i]['uid']+"&pending=on&mode=undefined\">"+idtysListOrdered[i]['uid'].substring(0, 20)
		+"</a><br>"+idtysListOrdered[i]['pubkey'].substring(0, 8)
		+"<br>->"+idtysListOrdered[i]['pendingCertifications'].length;
	      contenu += "</td><td align='center' style=\"background:"+colorPendingIdty+"\">"+timestampToDatetime(idtysListOrdered[i]['creationTimestamp'])
		+"<br>#"+idtysListOrdered[i]['BlockNumber']
		+"</td><td align='center' style=\"background:"+colorPendingIdty+"\">"
		+timestampToDatetime(idtysListOrdered[i]['expires_on'])+"</td>"
		+"<td style=\"background:#000000\">-</td>";

	      // printer les certifications
		for (let j=0;j<idtysListOrdered[i]['pendingCertifications'].length;j++)
		{
		  // Déterminer la couleur de la certification
		  let colorPendingSig = "";
		  //console.log("idtysListOrdered[%s]['pendingCertifications'][%s]['validBlockStamp'] = %s", i, j, idtysListOrdered[i]['pendingCertifications'][j]['validBlockStamp']);
		  if(idtysListOrdered[i]['pendingCertifications'][j]['validBlockStamp'] == true)
		  {
		          // Calculer la proportion de temps restant avant expiration de la certification(en pour 255ème)
			  let pendingSigProportion = ((idtysListOrdered[i]['pendingCertifications'][j]['timestampExpire']-currentBlockchainTimestamp)*200)/sigWindow;
			  if (pendingSigProportion < 0 ) { pendingSigProportion = 0; }
			  else if (pendingSigProportion > 200 ) { pendingSigProportion = 200; }
			  
			  colorPendingSig = "#"+parseInt(pendingSigProportion).toString(16)
			    +parseInt(pendingSigProportion).toString(16)+parseInt(pendingSigProportion).toString(16);
		  }
		  else { colorPendingSig = "#FF8000"; }
			    
			  
		  // Printer la certification
			  contenu += "<td align='center' style=\"background:"+colorPendingSig+"\">";
			  if (j == 4 ) { contenu += "<b>"; }
			  contenu += idtysListOrdered[i]['pendingCertifications'][j]['from']
			  +"<br>"+timestampToDatetime(idtysListOrdered[i]['pendingCertifications'][j]['timestampExpire'])
			  +"<br>#"+idtysListOrdered[i]['pendingCertifications'][j]['blockNumber'];
			  if (idtysListOrdered[i]['pendingCertifications'][j]['validBlockStamp'] == false)
			  {
			    contenu += "<br><font color='red'>["+tabTxt['INVALID_BLOCKSTAMP']+"]</font>";
			  }
			  else if ( idtysListOrdered[i]['pendingCertifications'][j]['timestampWritable'] > currentBlockchainTimestamp )
			  {
			    contenu += "<br><font color='DarkRed'>["+timestampToDatetime(idtysListOrdered[i]['pendingCertifications'][j]['timestampWritable'])+"]</font>";
			  }
			  else { contenu += "<br><font color='green'>["+tabTxt['SIG_PERIOD_OK']+"]</font>"; }
			  if (j == 4 ) { contenu += "</b>"; }
			  contenu += "</td>";
		}
		
		contenu += "</tr>";
		nbPrintMembers++;
	    }
	  }
	  contenu += "<tr><td colspan="+(4+nbMaxCertifs)+" align='center'> "+tabTxt['LAST_TR1']+" : <b>"+nbPrintMembers+"</b> "+tabTxt['LAST_TR2']+".</td></tr>";
	  contenu += "</table><br><hr>";

	  // Send html page
	  res.status(200).send('<pre>' + (contenu) + '</pre>');
	}
    } catch (e) {
	// En cas d'exception, afficher le message
	res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
    
  }));
  
  /****************************************
  * Lister les membres
  ***************************************/

  app.get('/members', (req, res) => co(function *() {
    
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
      var days = 400;// Valeur par défaut
      if( typeof(req.query.d) == 'undefined' ) {
        days = 400;
      } else {
	  days = req.query.d;
      }
      var order = 'asc'; // Valeur par défaut
      if (typeof(req.query.d) != 'undefined' && req.query.order == 'desc') {
	order = 'desc';
      }
      var sort_by="idtyWritten"; // Valeur par défaut
      if (typeof(req.query.sort_by) != 'undefined') {
	sort_by = req.query.sort_by;
      }
      var pendingSigs="no";
      if ( typeof(req.query.pendingSigs) != 'undefined' && req.query.pendingSigs == "yes") {
	pendingSigs = "yes";
      }
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
		// vérifier que l'émetteur de la certification n'a pas déjà certifié le membre m
		let doubloonIssuer = false;
		for(let j=0;j<membersCertifsList[m].length;j++)
		{
		  if (membersCertifsList[m][j].issuer == tmpQueryGetUidIssuerPendingCert[0].uid) { doubloonIssuer = true; }
		}
		if (!doubloonIssuer)
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
	  contenu += ' - tri par <select name="sort_by">';
	  contenu += '<option name="sort_by" value ="idtyWritten">date d\'obtention du statut de membre';
	  contenu += '<option name="sort_by" value ="expireMembership"';
	  if (sort_by == 'expireMembership' ) { contenu += ' selected'; }
	  contenu += '>date d\'expiration du membership';
	  contenu += '<option name="sort_by" value ="lastRenewal"';
	  if (sort_by == 'lastRenewal' ) { contenu += ' selected'; }
	  contenu += '>date de dernier renouvellement';
	  contenu += '<option name="sort_by" value ="oldestSig"';
	  if (sort_by == 'oldestSig' ) { contenu += ' selected'; }
	  contenu += '>date de plus vielle certification';
	  contenu += '<option name="sort_by" value ="lastSig"';
	  if (sort_by == 'lastSig' ) { contenu += ' selected'; }
	  contenu +='>date de plus récente certification';
	  contenu += '<option name="sort_by" value ="sigCount"';
	  if (sort_by == 'sigCount' ) { contenu += ' selected'; }
	  contenu +='>nombre de certifications reçues';
	  contenu += '</select> dans l\'ordre <select name="order">';
	  contenu += '<option name="order" value ="asc">croissant';
	  contenu += '<option name="order" value ="desc"';
	  if (order == 'desc' ) { contenu += ' selected'; }
	  contenu += '>décroissant</select>';

	  contenu += ' <input type="submit" value="envoyer"><br><br>';
	  if (pendingSigs == 'yes' ) { contenu += '[inscriptible : date à partir de laquelle cette certification pourra être écrite compte tenu de sigPeriod]<br>'; }
	  contenu += '<input type="checkbox" name="pendingSigs" value="yes"';
	  if (pendingSigs == 'yes' ) { contenu += ' checked'; }
	  contenu += '>Inclure les certifications en piscine.</form><br>';
	  
		  // Afficher le currentBlockchainTimestamp
		  contenu += '<i>Temps Blockchain actuel : '+timestampToDatetime(currentBlockchainTimestamp)+'.</i><br><br>';
		  
		  // On parcour tout les membres pour afficher ceux dont la date d'expiration est dans moins de 'd' jours
		  var nbPrintMembers = 0;
		  contenu += '<b>Membres dont le statut de membre va expirer dans moins de '+days+' jours :</b><table border=1>';
		  for (var i=0;i<membersListOrdered.length;i++)
		  {
		    if (membersListOrdered[i]['expireMembershipTimestamp'] < limitTimestamp && membersListOrdered[i]['expireMembershipTimestamp'] > currentBlockchainTimestamp)
		    {
		      // Printer les nom des colonnes
		      if (nbPrintMembers == 0) {
			contenu += "<tr><td align='center'>uid</td><td align='center'>obtention statut membre</td><td align='center'>dernier renouvellement</td>";
			contenu += "<td align='center'>date d'expiration du membre</td><td style=\"background:#000000\">-</td>";
			if (sort_by == 'lastSig') { contenu += "<td align='left' colspan="+nbMaxCertifs+">liste des certifications reçues (récentes -> anciennes)</td>"; }
			else { contenu += "<td align='left' colspan="+nbMaxCertifs+">liste des certifications reçues (anciennes -> récentes)</td>"; }
			contenu += "</tr>";
		      }
		      // Convertir timestamp en date
		      let tmpDateLastRenewal = new Date(membersListOrdered[i]['lastRenewalTimestamp']*1000);
		      let tmpDateExpire = new Date((membersListOrdered[i]['expireMembershipTimestamp'])*1000);
		      
		      // Calculer la proportion de membership restant (en pour 255ème)
		      let membershipProportion = ((membersListOrdered[i]['expireMembershipTimestamp']-currentBlockchainTimestamp)*255)/msValidity;
		      if (membershipProportion < 0 ) { membershipProportion = 0; }
		      else if (membershipProportion > 255 ) { membershipProportion = 255; }
		      
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
		        +"<br>->"+membersListOrdered[i]['certifications'].length;
		      if (pendingSigs == "yes" && membersListOrdered[i]['pendingCertifications'].length > 0)
		      { contenu += "(+"+membersListOrdered[i]['pendingCertifications'].length+")"; }
		      contenu += "</td><td align='center' style=\"background:#"+color+"\">"+timestampToDatetime(membersListOrdered[i]['idtyWrittenTimestamp'])
			+"<br>#"+membersListOrdered[i]['idtyWrittenBloc']
			+"</td><td align='center' style=\"background:#"+color+"\">"+timestampToDatetime(membersListOrdered[i]['lastRenewalTimestamp'])
			+"<br>#"+membersListOrdered[i]['lastRenewalWrittenBloc']
			+"</td><td align='center' style=\"background:#"+color+"\">"
			+timestampToDatetime(membersListOrdered[i]['expireMembershipTimestamp'])+"</td>"
			+"<td style=\"background:#000000\">-</td>";

		      // printer les certifications en piscine 
		      if (pendingSigs == "yes")
		      {
			for (let j=0;j<membersListOrdered[i]['pendingCertifications'].length;j++)
			{
			  // Calculer la proportion de temps restant avant expiration de la certification(en pour 255ème)
			  let pendingSigProportion = ((membersListOrdered[i]['pendingCertifications'][j]['timestampExpire']-currentBlockchainTimestamp)*200)/sigWindow;
			  if (pendingSigProportion < 0 ) { pendingSigProportion = 0; }
			  else if (pendingSigProportion > 200 ) { pendingSigProportion = 200; }
			  
			  let colorPendingSig = "#"+parseInt(pendingSigProportion).toString(16)
			    +parseInt(pendingSigProportion).toString(16)+parseInt(pendingSigProportion).toString(16);
			  
			  // Printer la certification
			  contenu += "<td align='center' style=\"background:"+colorPendingSig+"\">"+membersListOrdered[i]['pendingCertifications'][j]['from']
			  +"<br>"+timestampToDatetime(membersListOrdered[i]['pendingCertifications'][j]['timestampExpire'])
			  +"<br>émise #"+membersListOrdered[i]['pendingCertifications'][j]['blockNumber']
			  +"<br>[inscriptible "+timestampToDatetime(membersListOrdered[i]['pendingCertifications'][j]['timestampWritable'])+"]"
			  +"</td>";
			}
		      }
			
		      // printer les certifications écrites en blockchain
		      for (let j=0;j<membersListOrdered[i]['certifications'].length;j++)
		      {
			// Calculer la proportion de temps restant avant expiration de la certification(en pour 255ème)
			let sigProportion = ((membersListOrdered[i]['certifications'][j]['timestampExpire']-currentBlockchainTimestamp)*255)/sigValidity;
			if (sigProportion < 0 ) { sigProportion = 0; }
			else if (sigProportion > 255 ) { sigProportion = 255; }
			
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
			+"<br>"+timestampToDatetime(membersListOrdered[i]['certifications'][j]['timestampExpire'])
			+"<br>écrite #"+membersListOrdered[i]['certifications'][j]['writtenBloc']+"</td>";
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
      // get blockchain timestamp
      let resultQueryCurrentBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block ORDER BY `medianTime` DESC LIMIT 1 ');
      const currentBlockchainTimestamp = resultQueryCurrentBlock[0].medianTime;
      
      // Initaliser les variables
      var contenu = "";
      var nbExpirMembers = 0;
      var membersBlockExcluded = [];
      var membershipsTimeList = [];
      var membershipsBlockNumberList = [];
      var membershipsExpireTimeList = [];
      
      // Récupérer les paramètres
      var order = 'asc'; // Valeur par défaut
      if (req.query.order == 'desc') {
	order = 'desc';
      }
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
	
	// On parcour tout les membres pour afficher ceux qui ont expirer
	nbExpirMembers = 0;
	contenu += '<b>Membres dont le statut de membre a déjà expiré :</b><br><table border=1>';
	for (var i=0;i<membersList.length;i++) {
	  if (membersListOrdered[i][3] < currentBlockchainTimestamp && membersListOrdered[i][4] == 0) {
	    // Printer les nom des colonnes
	    if (nbExpirMembers == 0) {
	      contenu += "<tr><td align='center'>uid</td><td align='center'> date dernier renouvellement </td><td align='center'>n° bloc sortie</td><td align='center'> date d'expiration </td></tr>";
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
  
  /****************************************
  * Lister les blocs calculés par membres
  ***************************************/

  app.get('/blockMembers', (req, res) => co(function *() {
    try {
      // get GET parameters
      var begin = 0;// Default Value
      if( typeof(req.query.begin) != 'undefined' && req.query.begin >= 0) { begin = req.query.begin; }
      var end = -1;// Default Value is current timestamp
      if( typeof(req.query.end) != 'undefined' && req.query.end >= 0) { end = req.query.end; }
      
      // get beginBlock and endBlock
      var beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `number` = '+begin+' LIMIT 1');
      var endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `number` = '+end+' LIMIT 1');
      
      // get blockchain
      if (end >= begin && begin >= 0)
      {
        var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` < '+endBlock[0].medianTime+' AND `medianTime` > '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');
      }
      else
      {
	var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` > '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');
      }
     
      // get blockchain timestamp
      const currentBlockNumber = begin+blockchain.length-1;
      const currentBlockchainTimestamp = blockchain[currentBlockNumber].medianTime;
      if (end == -1) { end = currentBlockNumber; }
      
      // get idtys list
      var idtys = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`pub` FROM i_index WHERE `wasMember`=1');

      // get current membersCount
      const currentMembersCount = blockchain[currentBlockNumber].membersCount;
      
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
	    meanNonce: 0
	});
	tabIndexMembers[idtys[i].pub] = i;
      }
      
      for (let b=0;b<=currentBlockNumber;b++)
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
	  tabNbBlockByMember[m].writtenPercent = ((tabNbBlockByMember[m].nbBlocks * 100) / (currentBlockNumber+1)).toFixed(2);
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
      
      // Appeler le module blockChart
      let blockChartMod = blockChart(req, res, tabNbBlockByMemberSort, currentBlockNumber, begin, end);
      
      // renvoyer les données en JSON
      //var response = JSON.stringify(tabNbBlockByMemberSort);
      //res.status(200).send(response);      
      
    } catch (e) {
	// En cas d'exception, afficher le message
	res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
  }));
  
  /******************************************
  * Lister les infos de la monnaie M, N, etc
  *****************************************/
  
  app.get('/currency', (req, res) => co(function *() {
    try {
      // get GET parameters
      var begin = 0;// Default Value
      if( typeof(req.query.begin) != 'undefined' ) { begin = req.query.begin; }
      var end = -1;// Default Value is current timestamp
      if( typeof(req.query.end) != 'undefined' ) { end = req.query.end; }
      
      // get beginBlock and endBlock
      var beginBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `number` = '+begin+' LIMIT 1');
      var endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `number` = '+end+' LIMIT 1');
      
      // get blockchain
      if (end >= begin && begin >= 0)
      {
        var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`monetaryMass`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` < '+endBlock[0].medianTime+' AND `medianTime` > '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');
      }
      else
      {
	var blockchain = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`monetaryMass`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` > '+beginBlock[0].medianTime+' ORDER BY `medianTime` ASC');
      }
      
      // get blockchain timestamp
      const currentBlockNumber = begin+blockchain.length-1;
      const currentBlockchainTimestamp = blockchain[blockchain.length-1].medianTime;
      
      // create and fill tabMembersCount, tabMonetaryMass, tabCurrency and currentDividend
      var tabMembersCount = [];
      var tabMonetaryMass = [];
      var tabCurrency = [];
      var currentDividend = 0;
      let previousMemberCount = 0;
      let previousMonetaryMass = 0;
      for (let b=0;b<blockchain.length;b++)
      {
	if (blockchain[b].membersCount != previousMemberCount || blockchain[b].monetaryMass != previousMonetaryMass)
	{
	  tabMembersCount.push(blockchain[b].membersCount);
	  tabMonetaryMass.push(blockchain[b].monetaryMass);
	  tabCurrency.push({
	    blockNumber: blockchain[b].number,
	    timestamp: blockchain[b].medianTime,
	    membersCount: blockchain[b].membersCount,
	    monetaryMass: blockchain[b].monetaryMass,
	    relativMonetaryMass: 0
	  });

	  if ( blockchain[b].dividend > 0 )
	  {
	    currentDividend = blockchain[b].dividend;
	  }
	  previousMemberCount = blockchain[b].membersCount;
	  previousMonetaryMass = blockchain[b].monetaryMass;
	}
      }
      console.log("currentDividend %s", currentDividend);
      // create and fill tabRelativMonetaryMass
      var tabRelativMonetaryMass = []
      for (let i=0;i<tabMonetaryMass.length;i++)
      {
	tabRelativMonetaryMass.push(tabMonetaryMass[i] / currentDividend);
	tabCurrency[i].relativMonetaryMass = tabMonetaryMass[i] / currentDividend;
      }

      // Send JSON response
      var response = JSON.stringify(tabCurrency);
      res.status(200).send(response); 
      
    } catch (e) {
	// En cas d'exception, afficher le message
	res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
  }));
  
  // Lancer le serveur web
  let httpServer = http.createServer(app);
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
