"use strict";

const co = require('co')
const timestampToDatetime = require('../lib/timestampToDatetime')

// informatiosn a preserver entre 2 chargements de la page
var previousBlockNumber = 0;
var previousBlockHash = "";
var previousBlochainTimestamp = 0;
var identitiesList = [];
var idtysPendingCertifsList = [ [ [] ] ];
var nbMaxCertifs = 0;
var countMembersWithSigQtyValidCert = 0;

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow, sigQty } = req.app.locals
  
  try {
    // get blockchain timestamp
    let resultQueryCurrentBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`number`,`hash` FROM block ORDER BY `medianTime` DESC LIMIT 1 ');
    const currentBlockchainTimestamp = resultQueryCurrentBlock[0].medianTime;
    const currentBlockNumber = resultQueryCurrentBlock[0].number;
    const currentBlockHash = resultQueryCurrentBlock[0].hash;
    
    // Initaliser les variables
    var errors = "";
    //var identitiesList = [];
    //var idtysPendingCertifsList = [ [ [] ] ];
    
    // Récupérer les paramètres
    var days = req.query.d || 65 // Valeur par défaut
    var order = req.query.d && req.query.order || 'desc' // Valeur par défaut
    var sort_by = req.query.sort_by || "sigCount"; // Valeur par défaut
    var hideIdtyWithZeroCert = req.query.hideIdtyWithZeroCert || "no"; // Valeur par défaut
    var sortSig = req.query.sortSig || "Availability"; // Valeur par défaut
    var format = req.query.format || 'HTML'
    
    // Si idtysPendingCertifsList est déjà rempli, vérifier si nous sommes toujours sur la même branche
    if (idtysPendingCertifsList.length > 0)
    {
      // Récupérer le hash du précédent bloc courant 
      let resultQueryPreviousBlock = yield duniterServer.dal.peerDAL.query('SELECT `hash` FROM block WHERE `number`='+previousBlockNumber+' LIMIT 1 ');
      
      // Si nous ne sommes plus sur la même branche, tout réinitialiser
      if (resultQueryPreviousBlock[0].hash != previousBlockHash)
      {
	previousBlockNumber=0;
	previousBlockHash = "";
	previousBlochainTimestamp = 0;
	identitiesList.splice(0,identitiesList.length);
	idtysPendingCertifsList.splice(0,idtysPendingCertifsList.length);
	nbMaxCertifs = 0;
      }
    }
    
    // Récupérer la liste des identités en piscine
    const resultQueryIdtys = yield duniterServer.dal.peerDAL.query('SELECT `buid`,`pubkey`,`uid`,`hash`,`expires_on` FROM identities_pending WHERE `member`=0');
      
    // Récupérer pour chaque identité, l'ensemble des certifications qu'elle à reçue.
    for (let i=0;i<resultQueryIdtys.length;i++)
    {
      // Extraire le numéro de bloc d'émission de l'identité
      let idtyBlockStamp = resultQueryIdtys[i].buid.split("-");
      let idtyBlockNumber = idtyBlockStamp[0];
      
      // récupérer le medianTime du bloc d'émission de l'identité
      let resultQueryTimeCreateIdty = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `number`=\''+idtyBlockNumber+'\' LIMIT 1');
	
      // N'ajouter l'identité que si elle à été émise après le dernier remplissage de idtysPendingCertifsList
      if (resultQueryTimeCreateIdty[0].medianTime > previousBlochainTimestamp)
      {
	// Stocker les informations de l'identité
	identitiesList.push({
	  BlockNumber: idtyBlockNumber,
	  creationTimestamp: resultQueryTimeCreateIdty[0].medianTime,
	  pubkey: resultQueryIdtys[i].pubkey,
	  uid: resultQueryIdtys[i].uid,
	  hash: resultQueryIdtys[i].hash,
	  expires_on: resultQueryIdtys[i].expires_on,
	  nbValidCert: 0,
	  registrationAvailability: 0
	});
	idtysPendingCertifsList.push(new Array());
      }
      
      // récupérer l'ensemble des certifications en attente destinées à l'identité courante
      let tmpQueryPendingCertifsList = yield duniterServer.dal.peerDAL.query(
	'SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\''+resultQueryIdtys[i].pubkey+'\' AND `target`=\''+resultQueryIdtys[i].hash+'\' ORDER BY `expires_on` DESC');
	
      // Calculer le nombre de certifications en attentes destinées au membre courant
      let nbPendingCertifs = tmpQueryPendingCertifsList.length;
      let nbValidPendingCertifs = 0;
      
      // Trouver l'identité correspondante dnas le tableau identitiesList
      let indexIdty = -1;
      for (let i2=0;i2<identitiesList.length;i2++)
      {
	if (identitiesList[i2].hash == resultQueryIdtys[i].hash)
	{ indexIdty = i2; }
      }
      if (indexIdty == -1) { console.log("FATAL ERROR : idty %s (buid %s) not find in identitiesList memory !", resultQueryIdtys[i].uid, resultQueryIdtys[i].buid) }
	  
      // Récupérer les uid des émetteurs des certifications reçus par l'utilisateur
      // Et stocker les uid et dates d'expiration dans un tableau
      
      for (let j=0;j<nbPendingCertifs;j++)
      {
	// ne traiter la certif courante que si elle a été émise après le dernier remplissage de idtysPendingCertifsList
	if (tmpQueryPendingCertifsList[j].block_number > previousBlockNumber)
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
	    for (const idtyPendingCertifsList of idtysPendingCertifsList[indexIdty])
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
		idtysPendingCertifsList[indexIdty].push({
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
      }
	
      // Calculer le nombre maximal de certifications reçues par l'identité courante
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
    else if (sort_by == "sigCount" || sort_by == "registrationPackage")
    {
        // idtys loop
	for (let i=0;i<idtysPendingCertifsList.length;i++)
        {
	  let nbValidCert = 0;
	  let registrationAvailability= 0;
	  // Count nbValidCert and calculate registrationAvailability timestamp
	  for (const cert of idtysPendingCertifsList[i])
	  {
	    if (cert.validBlockStamp)
	    {
	      nbValidCert++;
	      registrationAvailability = (cert.timestampWritable > registrationAvailability) ? cert.timestampWritable : registrationAvailability;
	    }
	  }
	  identitiesList[i].nbValidCert = nbValidCert;
	  identitiesList[i].registrationAvailability = registrationAvailability;
	  
	  // Calculate registrationAvailabilityDelay
	  let registrationAvailabilityDelay = (registrationAvailability > currentBlockchainTimestamp) ? (registrationAvailability-currentBlockchainTimestamp):0;
	  
	  // Trier les identités au dossier complet par durée entre date de disponibilité et date d'expiration maximale théorique (=sigWindow-registrationAvailabilityDelay)
	  if (sort_by == "registrationPackage" && nbValidCert > sigQty)
	  {
	    tabSort.push(sigWindow-registrationAvailabilityDelay + (sigValidity*sigQty));
	  }
	  else
	  {
	    tabSort.push(sigWindow-registrationAvailabilityDelay + (sigValidity*nbValidCert));
	  }
        }
    }
    else { errors += "<p>ERREUR : param <i>sort_by</i> invalid !</p>"; }
    
    // Trier les identités par ordre decroissant du critère sort_by
    for (var i=0;i<identitiesList.length;i++)
    {
      // Vérifier que l'identité n'est pas devenue membre et na pas expiréée
      let continue_ = true;
      while (continue_)
      {
	  let tmpCheckIdty = yield duniterServer.dal.peerDAL.query('SELECT `uid` FROM i_index WHERE `member`=1 AND `pub`=\''+identitiesList[i].pubkey+'\' LIMIT 1');
	  // Si l'on trouve une identité membre correspondante ou que l'identité a expirée, alors supprimer cette identité des tableaux identitiesList et idtysPendingCertifsList
	  if (tmpCheckIdty.length > 0 || identitiesList[i].expires_on <= currentBlockchainTimestamp)
	  {
	    // Décrementer countMembersWithSigQtyValidCert
	    if (identitiesList[i].nbValidCert > sigQty) { countMembersWithSigQtyValidCert--; }
	    
	    // Supprimer l'identité et toutes les certifications qu'elle a reçue
	    identitiesList.splice(i, 1);
	    idtysPendingCertifsList.splice(i, 1);
	    
	    // Arrèter la boucle si le tableau est devenu vide
	    if (identitiesList.length == 0) { continue_ = false; }
	  }
	  // Sinon, c'est que l'on a trouver une identité qui n'est pas membre, on sort de cette boucle et on la traite
	  else { continue_ = false; }
      }
      
      // calculate countMembersWithSigQtyValidCert
      if ( identitiesList[i].nbValidCert >= sigQty && identitiesList[i].creationTimestamp > previousBlochainTimestamp) { countMembersWithSigQtyValidCert++; }
      
      let max = -1;
      let idMax =0;
      for (var j=0;j<identitiesList.length;j++)
      {
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
          nbValidCert: identitiesList[idMax].nbValidCert,
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
    
    // Stocker le blockNumber, hash et le medianTime de la branche courante
    previousBlockNumber = currentBlockNumber;
    previousBlockHash = currentBlockHash;
    previousBlochainTimestamp = currentBlockchainTimestamp;
    
    // Si le client demande la réponse au format JSON, le faire
    if (format == 'JSON')
    {
      // Send JSON reponse
      res.status(200).jsonp( idtysListOrdered )
    }
    // Sinon, printer le tableau html
    else
    {
      res.locals = {
        // Les varibles à passer au template
        days, sort_by, order, sortSig,
        hideIdtyWithZeroCert,
	
        currentBlockNumber,
        currentBlockchainTimestamp,
        limitTimestamp,
        sigWindow,
        idtyWindow,
        nbMaxCertifs,
	countMembersWithSigQtyValidCert,
        
        idtysListFiltered: idtysListOrdered.filter( idty=> 
              idty.expires_on < limitTimestamp
              && idty.expires_on > currentBlockchainTimestamp
              && (hideIdtyWithZeroCert != "yes" || idty.pendingCertifications.length > 0)
            ),
        
        // Template helpers
        timestampToDatetime,
        // Calculer la proportion de temps restant avant l'expiration
        color: function( timestamp, idtyWindow, max )
        {
	  const MIN = 80;
          let proportion = ((timestamp-currentBlockchainTimestamp)*(max-MIN))/idtyWindow;
          proportion = proportion < MIN ? MIN : proportion > max ? max : proportion 
          let hex = parseInt( proportion ).toString(16)
          return `#${hex}${hex}${hex}`
        }
      }
      next()
    }
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
  }
  
})