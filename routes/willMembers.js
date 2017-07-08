"use strict";

const co = require('co')
const crypto = require('crypto')
const wotb = require('wotb')

const timestampToDatetime = require(__dirname + '/../lib/timestampToDatetime')

const MIN_WILLMEMBERS_UPDATE_FREQ = 180;

// Préserver les résultats en cache
var lockWillMembers = false;
var willMembersLastUptime = 0;
var identitiesList = [];
var idtysPendingCertifsList = [];
var nbMaxCertifs = 0;
var countMembersWithSigQtyValidCert = 0;
var sentries = [];
var sentriesIndex = [];
var wotbIdIndex = [];
var meanSentriesReachedByIdtyPerCert = [];
var meanMembersReachedByIdtyPerCert = [];
var countIdtiesPerReceiveCert = [];
var membersQualityExt = [];

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer } = req.app.locals
  
  try {
    // get blockchain timestamp
    let resultQueryCurrentBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`number`,`hash`,`membersCount` FROM block ORDER BY `medianTime` DESC LIMIT 1 ');
    const currentBlockchainTimestamp = resultQueryCurrentBlock[0].medianTime;
    const currentMembersCount = resultQueryCurrentBlock[0].membersCount;
    const currentBlockNumber = resultQueryCurrentBlock[0].number;
    const currentBlockHash = resultQueryCurrentBlock[0].hash;

    // Initaliser les constantes
    const conf = duniterServer.conf;
    const dSen = Math.ceil(Math.pow(currentMembersCount, 1 / conf.stepMax));
    
    // Initaliser les variables
    let errors = "";
    let idtysListOrdered  = [];
    let sumPercentSentriesReached = 0;
    let sumPercentMembersReached = 0;
    
    // Récupérer les paramètres
    let days = req.query.d || 65 // Valeur par défaut
    let order = req.query.d && req.query.order || 'desc' // Valeur par défaut
    let sort_by = req.query.sort_by || "registrationPackage"; // Valeur par défaut
    let showIdtyWithZeroCert = req.query.showIdtyWithZeroCert || "no"; // Valeur par défaut
    let sortSig = req.query.sortSig || "Availability"; // Valeur par défaut
    let format = req.query.format || 'HTML';
    
    // Calculer le timestamp limite à prendre en compte
    let limitTimestamp = currentBlockchainTimestamp + (days*86400);
    
    // Alimenter wotb avec la toile de confiance actuelle
    const wotbInstance = wotb.newFileInstance(duniterServer.home + '/wotb.bin');
		
		
		// Vérifier si le cache doit être Réinitialiser
		let reinitCache = (Math.floor(Date.now() / 1000) > (willMembersLastUptime + MIN_WILLMEMBERS_UPDATE_FREQ));
		
		// Si le cache willMembers est dévérouillé, le vérouiller, sinon ne pas réinitialiser le cache
		if (reinitCache && !lockWillMembers)
		{
			lockWillMembers = true;
		}
		else if(lockWillMembers)
		{
			reinitCache = false;
		}

		if (reinitCache)
    {
      // Réinitialiser le cache
      identitiesList = [];
			idtysPendingCertifsList = [];
      nbMaxCertifs = 0;
      countMembersWithSigQtyValidCert = 0;
      sentries = [];
      sentriesIndex = [];
      wotbIdIndex = [];
			membersQualityExt = [];
      willMembersLastUptime = Math.floor(Date.now() / 1000);
      
      // Récupérer la liste des membres référents
      sentries = wotbInstance.getSentries(dSen);
      
      // Récupérer la liste des identités en piscine
      const resultQueryIdtys = yield duniterServer.dal.peerDAL.query('SELECT `buid`,`pubkey`,`uid`,`hash`,`expires_on` FROM identities_pending WHERE `member`=0');
	
      // Récupérer pour chaque identité, l'ensemble des certifications qu'elle à reçue.
      for (let i=0;i<resultQueryIdtys.length;i++)
      {
				// Extraire le numéro de bloc d'émission de l'identité
				let idtyBlockStamp = resultQueryIdtys[i].buid.split("-");
				let idtyBlockNumber = idtyBlockStamp[0];
	
				// récupérer le medianTime et le hash du bloc d'émission de l'identité
				let idtyEmittedBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`hash` FROM block WHERE `number`=\''+idtyBlockNumber+'\' LIMIT 1');
				
				// Récupérer l'identifiant wotex de l'identité (en cas d'identité multiple)
				let idties = yield duniterServer.dal.idtyDAL.query('' +
					'SELECT hash, uid, pub, wotb_id FROM i_index WHERE (uid = ? or pub = ?) ' +
					'UNION ALL ' + 'SELECT hash, uid, pubkey as pub, (SELECT NULL) AS wotb_id FROM idty WHERE (uid = ? or pubkey = ?)', [resultQueryIdtys[i].uid, resultQueryIdtys[i].uid, resultQueryIdtys[i].uid, resultQueryIdtys[i].uid]);
				let wotexId = '';
				if (idties.length > 1)
				{
					let pos = 0;
					for (const idty of idties)
					{
						if (idty.hash == resultQueryIdtys[i].hash) { wotexId = '['+pos+']'; }
						pos++;
					}
				}
	
				// vérifier la validité du blockstamp de l'identité
				let validIdtyBlockStamp = false;
				if (typeof(idtyEmittedBlock[0]) == 'undefined' || idtyEmittedBlock[0].hash == idtyBlockStamp[1])
				{ validIdtyBlockStamp = true; }

				// Stocker les informations de l'identité
				identitiesList.push({
						BlockNumber: idtyBlockNumber,
						creationTimestamp: (typeof(idtyEmittedBlock[0]) == 'undefined' ) ? currentBlockchainTimestamp:idtyEmittedBlock[0].medianTime,
						pubkey: resultQueryIdtys[i].pubkey,
						uid: resultQueryIdtys[i].uid,
						hash: resultQueryIdtys[i].hash,
						wotexId: wotexId,
						expires_on: (resultQueryIdtys[i].expires_on=="") ? 0:resultQueryIdtys[i].expires_on,
						nbCert: 0,
						nbValidPendingCert: 0,
						registrationAvailability: 0,
						validBlockStamp: validIdtyBlockStamp
				});
				idtysPendingCertifsList.push(new Array());
	
				// récupérer l'ensemble des certifications en attente destinées à l'identité courante
				let tmpQueryPendingCertifsList = yield duniterServer.dal.peerDAL.query(
					'SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\''+resultQueryIdtys[i].pubkey+'\' AND `target`=\''+resultQueryIdtys[i].hash+'\' ORDER BY `expires_on` DESC');

				// Récupérer les uid des émetteurs des certifications reçus par l'utilisateur
				// Et stocker les uid et dates d'expiration dans un tableau
				for (let j=0;j<tmpQueryPendingCertifsList.length;j++)
				{
					// Récupérer le medianTime et le hash du bloc d'émission de la certification 
					let emittedBlock = yield duniterServer.dal.peerDAL.query('SELECT `hash`,`medianTime` FROM block WHERE `number`=\''+tmpQueryPendingCertifsList[j].block_number+'\' AND `fork`=0 LIMIT 1');
						
						// Vérifier que l'émetteur de la certification correspond à une identité inscrite en blockchain
						let tmpQueryGetUidIssuerPendingCert = yield duniterServer.dal.peerDAL.query('SELECT `uid` FROM i_index WHERE `pub`=\''+tmpQueryPendingCertifsList[j].from+'\' LIMIT 1');
						if ( tmpQueryGetUidIssuerPendingCert.length > 0 )
						{
							// Récupérer la pubkey de l'émetteur
							let issuerPubkey = tmpQueryPendingCertifsList[j].from;
							
							// Récupérer le wotb_id
							let wotb_id = 0;
							if (typeof(wotbIdIndex[issuerPubkey]) == 'undefined')
							{
								wotb_id = (yield duniterServer.dal.iindexDAL.query('SELECT wotb_id FROM i_index WHERE pub = ? AND wotb_id IS NOT NULL', [issuerPubkey]))[0].wotb_id;
								wotbIdIndex[issuerPubkey] = wotb_id;
							}
							else { wotb_id = wotbIdIndex[issuerPubkey]; }
							
							// Vérifier si l'émetteur de la certification est référent
							let issuerIsSentry = false;
							if (typeof(sentriesIndex[issuerPubkey]) == 'undefined')
							{
								sentriesIndex[issuerPubkey] = false;
								for (let s=0;s<sentries.length;s++)
								{
									if (sentries[s] == wotb_id)
									{
										issuerIsSentry=true;
										sentriesIndex[issuerPubkey] = true;
										sentries.splice(s, 1);
									}
								}
							}
							else { issuerIsSentry = sentriesIndex[issuerPubkey]; }

							// Vérifier si le blockstamp est correct
							var validBlockStamp = false;
							if (typeof(emittedBlock[0]) != 'undefined' && emittedBlock[0].hash == tmpQueryPendingCertifsList[j].block_hash)
							{ validBlockStamp = true; }
							
							// récupérer le timestamp d'enchainement de la dernière certification écrite par l'émetteur
							let tmpQueryLastIssuerCert = yield duniterServer.dal.peerDAL.query('SELECT `chainable_on` FROM c_index WHERE `issuer`=\''+issuerPubkey+'\' ORDER BY `chainable_on` DESC LIMIT 1');
							let certTimestampWritable = 0;
							if ( typeof(tmpQueryLastIssuerCert[0]) != 'undefined' && typeof(tmpQueryLastIssuerCert[0].chainable_on) != 'undefined' )
							{ certTimestampWritable = tmpQueryLastIssuerCert[0].chainable_on; }
							//identitiesList[i].registrationAvailability = (certTimestampWritable > identitiesList[i].registrationAvailability) ? certTimestampWritable : identitiesList[i].registrationAvailability;
							
							// Vérifier que l'identité courant n'a pas déjà reçu d'autre(s) certification(s) de la part du même membre ET dans le même état de validité du blockstamp
							let doubloonPendingCertif = false;
							for (const pendingCert of idtysPendingCertifsList[i])
							{
								if (pendingCert.from == tmpQueryGetUidIssuerPendingCert[0].uid && pendingCert.validBlockStamp == validBlockStamp)
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
										pubkey: issuerPubkey,
										wotb_id: wotb_id,
										issuerIsSentry: issuerIsSentry,
										blockNumber: tmpQueryPendingCertifsList[j].block_number,
										timestampExpire: tmpQueryPendingCertifsList[j].expires_on,
										timestampWritable: certTimestampWritable,
										validBlockStamp: validBlockStamp
									});
									identitiesList[i].nbCert++;
									if (validBlockStamp) { identitiesList[i].nbValidPendingCert++; }
								}
							}
						}
				}

				// Calculer le nombre maximal de certifications reçues par l'identité courante
				if ( identitiesList[i].nbCert > nbMaxCertifs) { nbMaxCertifs = identitiesList[i].nbCert; }
	
				// calculate countMembersWithSigQtyValidCert
				if ( identitiesList[i].nbValidPendingCert >= conf.sigQty) { countMembersWithSigQtyValidCert++; }
      }  // END IDENTITIES LOOP
      
      // Réinitialiser sumSentriesReachedByIdtyPerCert, sumMembersReachedByIdtyPerCert et countIdtiesPerReceiveCert
      for (let i=0;i<=nbMaxCertifs;i++)
      {
				meanSentriesReachedByIdtyPerCert[i] = 0;
				meanMembersReachedByIdtyPerCert[i] = 0;
				countIdtiesPerReceiveCert[i] = 0;
			}
		} // END if (reinitCache)
		
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
						min = currentBlockchainTimestamp+conf.sigValidity; // begin to min = max

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
							wotb_id: idtysPendingCertifsList[i][idMin].wotb_id,
							issuerIsSentry: idtysPendingCertifsList[i][idMin].issuerIsSentry,
							blockNumber: idtysPendingCertifsList[i][idMin].blockNumber,
							timestampExpire: idtysPendingCertifsList[i][idMin].timestampExpire,
							timestampWritable: idtysPendingCertifsList[i][idMin].timestampWritable,
							validBlockStamp: idtysPendingCertifsList[i][idMin].validBlockStamp
						});
						
						// Calculer la date de disponibilité du dossier d'inscription de l'identité correspondante
						// := date de disponibilité maximale parmi les sigQty certifications aux dates de disponibilités les plus faibles
						if (j<conf.sigQty)
						{
							let timestampWritable = idtysPendingCertifsList[i][idMin].timestampWritable;
							identitiesList[i].registrationAvailability = (timestampWritable > identitiesList[i].registrationAvailability) ? timestampWritable : identitiesList[i].registrationAvailability;
						}

						// Exclure la valeur min avant de poursuivre le tri
						tmpExcluded[idMin] = true;
					}
					
				}
				idtysPendingCertifsList = idtysPendingCertifsListSort;
      }
      
      // Récupérer la valeur du critère de tri pour chaque identité
      var tabSort = [];
      if (sort_by == "creationIdty")
      {
				for (const idty of identitiesList)
				{
					tabSort.push(idty.expires_on);
				}
      }
      else if (sort_by == "sigCount" || sort_by == "registrationPackage")
      {
				for (const idty of identitiesList)
				{
					// Calculate registrationAvailabilityDelay
					let registrationAvailabilityDelay = (idty.registrationAvailability > currentBlockchainTimestamp) ? (idty.registrationAvailability-currentBlockchainTimestamp):0;
					
					// Trier les identités par date de disponibilité de leur dossier d'inscription (le signe moins est nécessaire car plus un dossier est disponible tôt
					//  plus la valeur de registrationAvailabilityDelay sera petite, hors le nombre obtenu est classé de façon décroissante)
					// Attribuer un malus de 2*sigValidity secondes par certification valide (plafonner à sigQty dans le cas de 'registrationPackage') 
					if (sort_by == "registrationPackage" && idty.nbValidPendingCert > conf.sigQty)
					{
						tabSort.push(-registrationAvailabilityDelay + (2*conf.sigValidity*conf.sigQty));
					}
					else
					{
						tabSort.push(-registrationAvailabilityDelay + (2*conf.sigValidity*idty.nbValidPendingCert));
					}
				}
      }
      else { errors += "<p>ERREUR : param <i>sort_by</i> invalid !</p>"; }

      // Trier les identités par ordre decroissant du critère sort_by
      for (var i=0;i<identitiesList.length;i++)
      {
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
						{
							doubloon = true;
						}
					}
					
					// Push max value on sort table (and test distance rule)
					if (!doubloon)
					{
						// Tester la présence de l'adhésion
						let membership = null
						const pendingMembershipsOfIdty = yield duniterServer.dal.msDAL.getPendingINOfTarget(identitiesList[idMax].hash);
						for (const ms of pendingMembershipsOfIdty)
						{
							if (!membership && ms.expires_on > currentBlockchainTimestamp)
							{
								membership = ms
							}
						}
						
						// Créer une wot temporaire
						let tmpWot = wotbInstance.memCopy();
						
						// Mesurer la qualité externe de chaque emetteur de chaque certification
						for (const cert of idtysPendingCertifsList[idMax])
						{
							if ( typeof(membersQualityExt[cert.from]) == 'undefined' )
							{
								let detailedDistanceQualityExt = tmpWot.detailedDistance(cert.wotb_id, dSen, conf.stepMax-1, conf.xpercent);
								membersQualityExt[cert.from] = ((detailedDistanceQualityExt.nbSuccess/detailedDistanceQualityExt.nbSentries)/conf.xpercent).toFixed(2);
							}
						}
						
						// Ajouter un noeud a la wot temporaire et lui donner toute les certifications valides reçues par l'indentité idMax
						let pendingIdtyWID = tmpWot.addNode();
						for (const cert of idtysPendingCertifsList[idMax])
						{
						  if (cert.validBlockStamp)
						  {
							  tmpWot.addLink(cert.wotb_id, pendingIdtyWID);
							}
						}
						// Récupérer les données de distance du dossier d'adhésion de l'indentité idMax
						let detailedDistance = tmpWot.detailedDistance(pendingIdtyWID, dSen, conf.stepMax, conf.xpercent);

						// Nettoyer la wot temporaire
						tmpWot.clear();
						
						// Calculer percentSentriesReached et percentMembersReached
						let percentSentriesReached = parseFloat(((detailedDistance.nbSuccess/detailedDistance.nbSentries)*100).toFixed(2));
						let percentMembersReached = parseFloat(((detailedDistance.nbReached/currentMembersCount)*100).toFixed(2));
						
						// Pousser l'identité dans le tableau idtysListOrdered
						idtysListOrdered.push({
							uid: identitiesList[idMax].uid,
							wotexId: identitiesList[idMax].wotexId,
							creationTimestamp: identitiesList[idMax].creationTimestamp,
							pubkey: identitiesList[idMax].pubkey,
							BlockNumber: identitiesList[idMax].BlockNumber,
							expires_on: identitiesList[idMax].expires_on,
							nbValidPendingCert: identitiesList[idMax].nbValidPendingCert,
							detailedDistance: detailedDistance,
							percentSentriesReached: percentSentriesReached,
							percentMembersReached: percentMembersReached,
							membership: membership,
							pendingCertifications: idtysPendingCertifsList[idMax],
							validBlockStamp: identitiesList[idMax].validBlockStamp
						});
						
						// Si le cache a été réinitialiser, recalculer les sommes meanSentriesReachedByIdtyPerCert et meanMembersReachedByIdtyPerCert
						if (reinitCache && identitiesList[idMax].nbValidPendingCert > 0)
						{
						  let nbReceiveCert = identitiesList[idMax].nbValidPendingCert;
							meanSentriesReachedByIdtyPerCert[nbReceiveCert-1] += percentSentriesReached;
							meanMembersReachedByIdtyPerCert[nbReceiveCert-1] += percentMembersReached;
							countIdtiesPerReceiveCert[nbReceiveCert-1] += 1;
						}
					} // END if (!doubloon)
				}  // END days limit rule

				// Exclure la valeur max avant de poursuivre le tri
				tabSort[idMax] = -1;
      }  // End sort identities loop
      
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
      
		if (reinitCache)
		{
		  // Calculate meanSentriesReachedByIdtyPerCert and meanMembersReachedByIdtyPerCert
		  for (let i=0;i<=nbMaxCertifs;i++)
      {
        if ( countIdtiesPerReceiveCert[i] > 0 )
        {
					meanSentriesReachedByIdtyPerCert[i] = parseFloat((meanSentriesReachedByIdtyPerCert[i]/countIdtiesPerReceiveCert[i]).toFixed(2));
					meanMembersReachedByIdtyPerCert[i] = parseFloat((meanMembersReachedByIdtyPerCert[i]/countIdtiesPerReceiveCert[i]).toFixed(2));
				}
				else
				{
					meanSentriesReachedByIdtyPerCert[i] = 0.0;
					meanMembersReachedByIdtyPerCert[i] = 0.0;
				}
			}
			
			// Dévérouiller le cache willMembers
			lockWillMembers = false;
		}
    
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
				host: req.headers.host.toString(),
				// get parameters
        days, sort_by, order, sortSig,
        showIdtyWithZeroCert,
				// page data
        currentBlockNumber,
        currentBlockchainTimestamp,
				currentMembersCount,
        limitTimestamp,
				nbMaxCertifs,
				countMembersWithSigQtyValidCert,
				idtysListFiltered: idtysListOrdered.filter( idty=> 
				idty.expires_on < limitTimestamp
				//&& idty.expires_on > currentBlockchainTimestamp
				&& (showIdtyWithZeroCert == "yes" || idty.pendingCertifications.length > 0)
				),
				// currency parameters
				dSen,
        sigQty: conf.sigQty,
        sigWindow: conf.sigWindow,
        idtyWindow: conf.idtyWindow,
        xpercent: conf.xpercent,
				// willMembers cache data
				meanSentriesReachedByIdtyPerCert,
				meanMembersReachedByIdtyPerCert,
				membersQualityExt,
        // Template helpers
        timestampToDatetime,
        // Calculer la proportion de temps restant avant l'expiration
        color: function( timestamp, idtyWindow, max )
        {
					const MIN = 120;
					let proportion = (((timestamp-currentBlockchainTimestamp)*(max-MIN))/idtyWindow)+MIN;
          proportion = proportion < MIN ? MIN : proportion > max ? max : proportion 
          let hex = parseInt( proportion ).toString(16)
          return `#${hex}${hex}${hex}`
        }
      }
			// Passer la main au template
      next()
    }
	}
	catch (e)
	{
		// En cas d'exception, afficher le message
		res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
	}
  
})
