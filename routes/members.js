"use strict";

const co = require('co')
const wotb = require('wotb')

const timestampToDatetime = require(__dirname + '/../lib/timestampToDatetime')

const MIN_MEMBERS_UPDATE_FREQ = 180;

// Préserver les résultats en cache
var lockMembers = false;
var membersLastUptime = 0;
var previousMode = null;
var previousCentrality = null;
var membersList = [];
var membersIdentity = [];
var membersFirstCertifExpire = [];
var membersCertifsList = [];
var membersPendingCertifsList = [];
var membershipsTimeList = [];
var membershipsBlockNumberList = [];
var membershipsExpireTimeList = [];
var nbMaxCertifs = 0;
var sentries = [];
var sentriesIndex = [];
var membersQualityExt = [];
var meanSentriesReachedBySentriesInSingleExtCert = 0;
var meanMembersReachedBySentriesInSingleExtCert = 0;
var meanSentriesReachedByMembersInSingleExtCert = 0;
var meanMembersReachedByMembersInSingleExtCert = 0;

// wotCentrality cache
var lockCentralityCalc = false;
var membersLastCentralityCalcTime = 0;
var membersCentrality = [];
var meanCentrality = 0;
var meanShortestsPathLength = 0;
var nbShortestsPath = 0;


module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer  } = req.app.locals
  
  try {
    // Initaliser les constantes
    const conf = duniterServer.conf;
    const head = yield duniterServer.dal.getCurrentBlockOrNull();
    const currentBlockchainTimestamp =  head ? head.medianTime : 0;
    const membersCount = head ? head.membersCount : 0;
    const dSen = Math.ceil(Math.pow(membersCount, 1 / conf.stepMax));
    
    // Initaliser les variables
		let membersListOrdered = [];
		let membersCertifsListSorted = [];
		let tabSort = [];
		let countSentries = 0;
		let membersNbSentriesUnreached = [];

    // Récupéré les paramètres
    var days = req.query.d || 400 // Valeur par défaut
    var mode = req.query.mode || 'received' // Valeur par défaut
    var order = req.query.d && req.query.order || 'desc' // Valeur par défaut
    var sort_by = req.query.sort_by || "idtyWritten" // Valeur par défaut
		var pendingSigs = req.query.pendingSigs || "no"; // Valeur par défaut
		var centrality = req.query.centrality || "no"; // Valeur par défaut
		var format = req.query.format || 'HTML'; // Valeur par défaut
    
    // Alimenter wotb avec la toile actuelle
    const wotbInstance = wotb.newFileInstance(duniterServer.home + '/wotb.bin');
		
		// Vérifier si le cache doit être Réinitialiser
		let reinitCache = (Math.floor(Date.now() / 1000) > (membersLastUptime + MIN_MEMBERS_UPDATE_FREQ));
		
		// Si changement de conditions, alors forcer le rechargement du cache s'il n'est pas, vérouillé, sinon forcer les conditions à celles en mémoire
		if (previousMode != mode || previousCentrality != centrality)
		{
			if (!lockMembers)
			{
				lockMembers = true;
				reinitCache = true;
			}
			else
			{
				mode = previousMode;
				centrality = previousCentrality;
			}
		}
		// Sinon, si les conditions sont identiques :
		// Si le cache members est dévérouillé, le vérouiller, sinon ne pas réinitialiser le cache
		else if (reinitCache && !lockMembers)
		{
			lockMembers = true;
		}
		else if(lockMembers)
		{
			reinitCache = false;
		}
		
		if (reinitCache)
		{
			// Réinitialiser le cache
			membersLastUptime = Math.floor(Date.now() / 1000);
			previousMode = mode;
			previousCentrality = centrality;
			membersList = [];
			membersIdentity = [];
			membersFirstCertifExpire = [];
			membersCertifsList = [];
			membersPendingCertifsList = [];
			membershipsTimeList = [];
			membershipsBlockNumberList = [];
			membershipsExpireTimeList = [];
			nbMaxCertifs = 0;
			sentries = [];
			sentriesIndex = [];
			membersQualityExt = [];
			meanSentriesReachedBySentriesInSingleExtCert = 0;
			meanMembersReachedBySentriesInSingleExtCert = 0;
			meanSentriesReachedByMembersInSingleExtCert = 0;
			meanMembersReachedByMembersInSingleExtCert = 0;
			
			// Réinitialiser le cache des données de centralité
			if (centrality=='yes')
			{
				membersLastCentralityCalcTime = Math.floor(Date.now() / 1000);
				membersCentrality = [];
				meanCentrality = 0;
				meanShortestsPathLength = 0;
				nbShortestsPath = 0;
			}
			
			// Récupérer la liste des membres référents
			sentries = wotbInstance.getSentries(dSen);
    
			// Récupérer la liste des identités ayant actuellement le statut de membre
			membersList = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`pub`,`member`,`written_on`,`wotb_id` FROM i_index WHERE `member`=1');
    
			// Récupérer pour chaque identité, le numéro du block d'écriture du dernier membership
			// Ainsi que la première ou dernière certification
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
				
				// Vérifier si le membre est référent
				let currentMemberIsSentry = false;
				sentriesIndex[membersList[m].uid] = false;
				for (let s=0;s<sentries.length;s++)
				{
					if (sentries[s] == membersList[m].wotb_id)
					{
						currentMemberIsSentry=true;
						sentries.splice(s, 1);
						sentriesIndex[membersList[m].uid] = true;
					}
				}
				
				// Réinitialiser le degré de centralité du membre
				if (centrality=='yes')
				{
					membersCentrality[membersList[m].wotb_id] = 0;
				}
				
				// Créer une wot temporaire
				let tmpWot = wotbInstance.memCopy();
				
				// Récupérer les informations détaillés de distance pour le membre courant
				let tmpWot1 = wotbInstance.memCopy();
				let detailedDistance = tmpWot.detailedDistance(membersList[m].wotb_id, dSen, conf.stepMax, conf.xpercent);
				membersNbSentriesUnreached[membersList[m].uid] = parseInt(detailedDistance.nbSentries)-parseInt(detailedDistance.nbSuccess);
				//console.log("membersNbSentriesUnreached[%s] = %s", membersList[m].uid, membersNbSentriesUnreached[membersList[m].uid]);
				
				// Mesurer la qualité externe du membre courant
				let detailedDistanceQualityExt = tmpWot.detailedDistance(membersList[m].wotb_id, dSen, conf.stepMax-1, conf.xpercent);
				membersQualityExt[membersList[m].uid] = ((detailedDistanceQualityExt.nbSuccess/detailedDistanceQualityExt.nbSentries)/conf.xpercent).toFixed(2);
				
				// Calculate meanSentriesReachedBySentriesInSingleExtCert, meanMembersReachedBySentriesInSingleExtCert, meanSentriesReachedByMembersInSingleExtCert and meanMembersReachedByMembersInSingleExtCert
				if (currentMemberIsSentry)
				{
					meanSentriesReachedBySentriesInSingleExtCert += parseFloat(((detailedDistanceQualityExt.nbSuccess/detailedDistanceQualityExt.nbSentries)*100).toFixed(2));
					meanMembersReachedBySentriesInSingleExtCert += parseFloat(((detailedDistanceQualityExt.nbReached/membersList.length)*100).toFixed(2));
					countSentries++;
				}
				meanSentriesReachedByMembersInSingleExtCert += parseFloat(((detailedDistanceQualityExt.nbSuccess/detailedDistanceQualityExt.nbSentries)*100).toFixed(2));
				meanMembersReachedByMembersInSingleExtCert += parseFloat(((detailedDistanceQualityExt.nbReached/membersList.length)*100).toFixed(2));
				
				// Nettoyer la wot temporaire
				tmpWot.clear();
				
				// Stocker les informations de l'identité
				membersIdentity.push({
					writtenBloc: blockstampIdtyWritten[0],
					writtenTimestamp: resultQueryTimeWrittenIdty[0].medianTime,
					detailedDistance: detailedDistance,
					isSentry: currentMemberIsSentry
				});
				
				// récupérer toutes les certification  reçus/émises par l'utilisateur
				let tmpQueryCertifsList = [];
				let tmpOrder = (sort_by == "lastSig") ? 'DESC' : 'ASC';
				if (mode == 'emitted')
				{
					tmpQueryCertifsList = yield duniterServer.dal.peerDAL.query(
						'SELECT `receiver`,`written_on`,`expires_on` FROM c_index WHERE `issuer`=\''+membersList[m].pub+'\' ORDER BY `expires_on` '+tmpOrder);
				}
				else
				{
					tmpQueryCertifsList = yield duniterServer.dal.peerDAL.query(
						'SELECT `issuer`,`written_on`,`expires_on` FROM c_index WHERE `receiver`=\''+membersList[m].pub+'\' ORDER BY `expires_on` '+tmpOrder);
				}

				// Calculer le nombre de certifications reçus/émises par le membre courant
				let nbWrittenCertifs = tmpQueryCertifsList.length;
				
				// Récupérer les uid des émetteurs/receveurs des certifications reçus/émises par l'utilisateur
				// Et stocker les uid et dates d'expiration dans un tableau
				membersCertifsList[m] = new Array();
				for (var i=0;i<nbWrittenCertifs;i++)
				{
					let tmpQueryGetUidProtagonistCert
					if (mode == 'emitted')
					{
						tmpQueryGetUidProtagonistCert = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`wotb_id` FROM i_index WHERE `pub`=\''+tmpQueryCertifsList[i].receiver+'\' LIMIT 1');
					}
					else
					{
						tmpQueryGetUidProtagonistCert = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`wotb_id` FROM i_index WHERE `pub`=\''+tmpQueryCertifsList[i].issuer+'\' LIMIT 1');
					}
					let tmpBlockWrittenOn = tmpQueryCertifsList[i].written_on.split("-");
					
					// Stoker la liste des certifications qui n'ont pas encore expirées
					if (tmpQueryCertifsList[i].expires_on > currentBlockchainTimestamp)
					{
						if (i == 0)
						{
							membersFirstCertifExpire.push(tmpQueryCertifsList[0].expires_on);
						}
						membersCertifsList[m].push({
							protagonistWotId: tmpQueryGetUidProtagonistCert[0].wotb_id,
							issuer: (mode=='emitted') ? membersList[m].uid:tmpQueryGetUidProtagonistCert[0].uid,
							receiver: (mode!='emitted') ? membersList[m].uid:tmpQueryGetUidProtagonistCert[0].uid,
							writtenBloc: tmpBlockWrittenOn[0],
							timestampExpire: tmpQueryCertifsList[i].expires_on
						});
					}
				}
				
					// Récupérer toutes les certification en piscine
					let nbValidPendingCertifs = 0;
					let tmpQueryPendingCertifsList = [];
					if (mode == 'emitted')
					{
						tmpQueryPendingCertifsList = yield duniterServer.dal.peerDAL.query(
							'SELECT `from`,`to`,`block_number`,`expires_on` FROM certifications_pending WHERE `from`=\''+membersList[m].pub+'\' ORDER BY `expires_on` '+tmpOrder);
					}
					else
					{
						tmpQueryPendingCertifsList = yield duniterServer.dal.peerDAL.query(
							'SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\''+membersList[m].pub+'\' ORDER BY `expires_on` '+tmpOrder);
					}
					
					// Récupérer les uid des émetteurs des certifications reçus par l'utilisateur
					// Et stocker les uid et dates d'expiration dans un tableau
					membersPendingCertifsList[m] = new Array();
					for (var i=0;i<tmpQueryPendingCertifsList.length;i++)
					{
						// Récupérer le medianTime et le hash du bloc d'émission de la certification 
						let emittedBlock = yield duniterServer.dal.peerDAL.query('SELECT `hash`,`medianTime` FROM block WHERE `number`=\''+tmpQueryPendingCertifsList[i].block_number+'\' AND `fork`=0 LIMIT 1');
						
						let tmpPub = (mode=='emitted') ? tmpQueryPendingCertifsList[i].to:tmpQueryPendingCertifsList[i].from;
						let tmpQueryGetUidProtagonistPendingCert = yield duniterServer.dal.peerDAL.query('SELECT `uid` FROM i_index WHERE `pub`=\''+tmpPub+'\' LIMIT 1');
						
						// Vérifier que l'émetteur de la certification correspond à une identié connue
						if ( tmpQueryGetUidProtagonistPendingCert.length > 0 )
						{
							// Vérifier la validité du blockStamp de la certification en piscine
							let validBlockStamp = false;
							if (typeof(emittedBlock[0]) != 'undefined' && emittedBlock[0].hash == tmpQueryPendingCertifsList[i].block_hash)
							{ validBlockStamp = true; }
							
							// Vérifier que le membre courant n'a pas déjà émis/reçu d'autre(s) certification(s) vis à vis du même protagoniste ET dans le même état de validité du blockstamp
							let doubloonPendingCertif = false;
							for (const pendingCert of membersPendingCertifsList[m])
							{
								if (pendingCert.protagonist == tmpQueryGetUidProtagonistPendingCert[0].uid && pendingCert.validBlockStamp == validBlockStamp)
								{
									doubloonPendingCertif = true;
								}
							}
							if (!doubloonPendingCertif)
							{
								// récupérer le timestamp d'écriture de la dernière certification écrite par l'émetteur
								let tmpQueryLastIssuerCert = yield duniterServer.dal.peerDAL.query('SELECT `chainable_on` FROM c_index WHERE `issuer`=\''+tmpQueryPendingCertifsList[i].from+'\' ORDER BY `expires_on` DESC LIMIT 1');
									
								// Stoker la liste des certifications en piscine qui n'ont pas encore expirées
								if (tmpQueryPendingCertifsList[i].expires_on > currentBlockchainTimestamp)
								{
									membersPendingCertifsList[m].push({
											protagonist: tmpQueryGetUidProtagonistPendingCert[0].uid,
											protagonistIsSentry: sentriesIndex[tmpQueryGetUidProtagonistPendingCert[0].uid],
											blockNumber: tmpQueryPendingCertifsList[i].block_number,
											timestampExpire: tmpQueryPendingCertifsList[i].expires_on,
											timestampWritable: (typeof(tmpQueryLastIssuerCert[0]) == 'undefined') ? 0:tmpQueryLastIssuerCert[0].chainable_on,
											validBlockStamp: validBlockStamp
									});
									nbValidPendingCertifs++;
								}
								
							}
						}
					}
				
				// Calculer le nombre maximal de certifications reçus par le membre courant
				let nbCertifs = nbWrittenCertifs + nbValidPendingCertifs;
				if ( nbCertifs > nbMaxCertifs) { nbMaxCertifs = nbCertifs; }
			} // END of members loop
			
			// Convertir chaque blockNumber (de membership) en timestamp
			for (const membershipBlockNumber of membershipsBlockNumberList)
			{
				membershipsTimeList.push(yield duniterServer.dal.peerDAL.query(
					'SELECT `medianTime` FROM block WHERE `number`=\''+membershipBlockNumber+'\' LIMIT 1') );
			}
    
			// Traiter les cas ou expires_on est indéfini
			for (let i=0;i<membershipsExpireTimeList.length;i++)
			{
				if (membershipsExpireTimeList[i] == null)
				{
					membershipsExpireTimeList[i] = membershipsTimeList[i] + msValidity;
				}
			}
			
			// Calculer le degré de centralité de tout les membres (si demandé)
			if (centrality=='yes')
			{
				let test = '';
				for (const member of membersList)
				{
					//if (sentriesIndex[member.uid])
					//{
						let tmpWot = wotbInstance.memCopy();
						for (const member2 of membersList)
						{
							if (member.wotb_id != member2.wotb_id)
							{
								let paths = tmpWot.getPaths(member.wotb_id, member2.wotb_id, conf.stepMax);
								if (paths.length > 0)
								{
									let shortestPathLength = paths[paths.length-1].length;
									meanShortestsPathLength += shortestPathLength;
									nbShortestsPath++;
									let indexMembersPresent = new Array();
									/*for (const path of paths)
									{
										if (path.length < shortestPathLength) { shortestPathLength = path.length; }
									}*/
									for (const path of paths)
									{
										//if (path[0] == 0 && path.length == shortestPathLength) { test += "\n"+'0-->'; }
										for (let i=0;i<path.length;i++)
										{
											if (path.length == shortestPathLength && i>0 && i<(path.length-1))
											{
												//if (path[0] == 0) { test += path[i]+'-->'; }
												membersCentrality[path[i]]++;
												indexMembersPresent[path[i]] = path[i];
											}
										}
										//if (path[0] == 0 && path.length == shortestPathLength) { test += ''+path[path.length-1]; }
									}
									for (const indexMember of indexMembersPresent)
									{
										membersCentrality[indexMember]++;
									}
								}
							}
						}
						tmpWot.clear();
					//}
				}
			}
		} // END if (reinitCache)
        
    // Calculer le timestamp limite à prendre en compte
    let limitTimestamp = currentBlockchainTimestamp + (days*86400);
        
    // trier les membres par ordre croissant/decroissant du critère sort_by
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
		else if (sort_by == "centrality")
		{ 
			for (const member of membersList)
			{
				tabSort.push(membersCentrality[member.wotb_id]);
			}
		}
    else if (sort_by == "sigCount")
    { 
      for (const memberCertifsList of membersCertifsList)
      {
        tabSort.push(memberCertifsList.length);
      }
    }
    else { res.status(500).send(`<pre><p>ERREUR : param <i>sort_by</i> invalid !</p></pre>`) } //
    
    for (var i=0;i<membersList.length;i++)
    {
      var maxTime = 0;
      if (order == 'asc') { maxTime = currentBlockchainTimestamp + (conf.msValidity*2); }
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
					wotb_id: membersList[idMaxTime].wotb_id,
          uid: membersList[idMaxTime].uid,
          pub: membersList[idMaxTime].pub,
          idtyWrittenTimestamp: membersIdentity[idMaxTime].writtenTimestamp,
          idtyWrittenBloc: membersIdentity[idMaxTime].writtenBloc,
          lastRenewalTimestamp: membershipsTimeList[idMaxTime][0].medianTime,
          lastRenewalWrittenBloc: membershipsBlockNumberList[idMaxTime],
          expireMembershipTimestamp: membershipsExpireTimeList[idMaxTime],
          certifications: membersCertifsList[idMaxTime],
          pendingCertifications: membersPendingCertifsList[idMaxTime],
					detailedDistance: membersIdentity[idMaxTime].detailedDistance,
					percentSentriesReached: parseFloat(((membersIdentity[idMaxTime].detailedDistance.nbSuccess/membersIdentity[idMaxTime].detailedDistance.nbSentries)*100).toFixed(2)),
					isSentry: membersIdentity[idMaxTime].isSentry
        });
        
        membersCertifsListSorted.push({
					issuer: membersCertifsList[idMaxTime].issuer,
					receiver: membersCertifsList[idMaxTime].receiver,
					writtenBloc: membersCertifsList[idMaxTime].writtenBloc,
					timestampExpire: membersCertifsList[idMaxTime].timestampExpire
        });
      }
      // Exclure la valeur max avant de poursuivre le tri
      tabSort[idMaxTime] = -1;
    }
    
    if (reinitCache)
		{
			// Calculate mean Members/Sentries ReachedBy Members/Sentries InSingleExtCert
			if (countSentries > 0)
			{
				meanSentriesReachedBySentriesInSingleExtCert = parseFloat((meanSentriesReachedBySentriesInSingleExtCert/countSentries).toFixed(2));
				meanMembersReachedBySentriesInSingleExtCert = parseFloat((meanMembersReachedBySentriesInSingleExtCert/countSentries).toFixed(2));
			}
			if (membersList.length > 0)
			{
				meanSentriesReachedByMembersInSingleExtCert = parseFloat((meanSentriesReachedByMembersInSingleExtCert/membersList.length).toFixed(2));
				meanMembersReachedByMembersInSingleExtCert = parseFloat((meanMembersReachedByMembersInSingleExtCert/membersList.length).toFixed(2));
			}
			
			// recalculate meanCentrality and meanShortestsPathLength
			if (centrality=='yes')
			{
				for (const memberCentrality of membersCentrality)
				{
					meanCentrality += memberCentrality;
				}
				meanCentrality /= membersCentrality.length;
				meanShortestsPathLength /= nbShortestsPath;
			}
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
				host: req.headers.host.toString(),
				// get parameters
        days, mode, sort_by, order,
				pendingSigs, centrality,
				
				// page data
        currentBlockchainTimestamp,
				limitTimestamp, nbMaxCertifs,
				membersListFiltered: membersListOrdered.filter( member=> 
				member.expireMembershipTimestamp < limitTimestamp 
				&& member.expireMembershipTimestamp > currentBlockchainTimestamp
				),
				// currency parameters
				xpercent: conf.xpercent,
				sigWindow: conf.sigWindow,
				idtyWindow: conf.idtyWindow,
				msValidity: conf.msValidity,
				sigValidity: conf.sigValidity,
				stepMax: conf.stepMax,
				
				// members cache data
				membersLastUptime,
				membersQualityExt,
				meanSentriesReachedBySentriesInSingleExtCert,
				meanMembersReachedBySentriesInSingleExtCert,
				meanSentriesReachedByMembersInSingleExtCert,
				meanMembersReachedByMembersInSingleExtCert,
				
				// centrality cache data
				lockCentralityCalc,
				membersLastCentralityCalcTime,
				membersCentrality,
				meanCentrality,
				meanShortestsPathLength,
				nbShortestsPath,
        
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
        }
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
      // Dévérouiller le cache members
      lockMembers = false;
      next()
    }
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`)
  }
  
})