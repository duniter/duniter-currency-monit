"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const DataFinder_1 = require("../lib/DataFinder");
const constants2_1 = require("../lib/constants2");
const randomInt = require(__dirname + '/../lib/randomInt');
const timestampToDatetime = require(__dirname + '/../lib/timestampToDatetime');
const membersQuality = require(__dirname + '/tools/membersQuality');
// Préserver les résultats en cache
var lockMembers = false;
var membersLastUptime = 0;
var previousMode = null;
var previousCentrality = null;
var previousNextYn = "no";
var previousRandomList = "no";
var previousRandomCounts = 10;
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
var sentriesIndex = {};
var countSentries = 0;
/*var meanSentriesReachedBySentriesInSingleExtCert = 0;
var meanMembersReachedBySentriesInSingleExtCert = 0;
var meanSentriesReachedByMembersInSingleExtCert = 0;
var meanMembersReachedByMembersInSingleExtCert = 0;*/
var proportionMembersWithQualityUpper1 = 0;
var proportionMembersWithQualityUpper1IfNoSentries = 0;
// wotCentrality cache
var lockCentralityCalc = false;
var membersLastCentralityCalcTime = 0;
var membersCentrality = [];
var meanCentrality = 0;
var meanShortestsPathLength = 0;
var nbShortestsPath = 0;
module.exports = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var { duniterServer } = req.app.locals;
    const dataFinder = new DataFinder_1.DataFinder(duniterServer);
    try {
        // Initaliser les constantes
        const conf = duniterServer.conf;
        const head = yield duniterServer.dal.getCurrentBlockOrNull();
        const currentBlockchainTimestamp = head ? head.medianTime : 0;
        const membersCount = head ? head.membersCount : 0;
        var dSen = Math.ceil(Math.pow(membersCount, 1 / conf.stepMax));
        // Initaliser les variables
        let membersListOrdered = [];
        let membersCertifsListSorted = [];
        let tabSort = [];
        let membersNbSentriesUnreached = [];
        // Récupéré les paramètres
        var days = req.query.d || 400; // Valeur par défaut
        var mode = req.query.mode || 'received'; // Valeur par défaut
        var order = req.query.d && req.query.order || 'desc'; // Valeur par défaut
        var sort_by = req.query.sort_by || "idtyWritten"; // Valeur par défaut
        var pendingSigs = req.query.pendingSigs || "no"; // Valeur par défaut
        var centrality = req.query.centrality || "no"; // Valeur par défaut
        var format = req.query.format || 'HTML'; // Valeur par défaut
        let uidOrPubList = req.query.uidOrPubList === 'yes';
        let uidOrPubValue = req.query.uidOrPubValue;
        let nextYn = (req.query.nextYn == "yes") ? "yes" : "no";
        let randomList = req.query.randomList === 'no' ? 'no' : 'yes';
        let numberOfRandomMembers = parseInt(req.query.randomCounts) || constants2_1.MonitConstants.MEMBERS_VIEW.DEFAULT_MEMBERS_RANDOM_NUMBER;
        // Recherche aléatoire
        if (randomList === 'yes') {
            if (isNaN(numberOfRandomMembers)) {
                numberOfRandomMembers = constants2_1.MonitConstants.MEMBERS_VIEW.DEFAULT_MEMBERS_RANDOM_NUMBER;
            }
            numberOfRandomMembers = Math.min(numberOfRandomMembers, constants2_1.MonitConstants.MEMBERS_VIEW.MEMBERS_DISPLAY_MAX);
        }
        // Vérifier la valeur de nextYn dans le cache
        let lastUpgradeTimeDatas = membersQuality(constants2_1.MonitConstants.QUALITY_CACHE_ACTION.INIT);
        let dSenCache = membersQuality(constants2_1.MonitConstants.QUALITY_CACHE_ACTION.GET_D_SEN);
        if (lastUpgradeTimeDatas > 0 && dSenCache > dSen) {
            previousNextYn == "yes";
        }
        // Recherche par pseudo/pubkey
        if (uidOrPubList) {
            // UID/PUB > random
            randomList = 'no';
            if (!uidOrPubValue || uidOrPubValue.length < 3) {
                // Recherche trop large
                uidOrPubList = false;
                randomList = 'yes'; // A la place
            }
        }
        // Alimenter wotb avec la toile actuelle
        const wotbInstance = duniterServer.dal.wotb;
        // Vérifier si le cache doit être Réinitialiser
        let reinitCache = (Math.floor(Date.now() / 1000) > (membersLastUptime + constants2_1.MonitConstants.MIN_MEMBERS_UPDATE_FREQ));
        // Si changement de conditions, alors forcer le rechargement du cache s'il n'est pas vérouillé, sinon forcer les conditions à celles en mémoire
        // Si recherche par UID ou pubkey => recharger systématiquement
        if (uidOrPubList || previousMode != mode || previousCentrality != centrality || previousNextYn != nextYn || previousRandomList != randomList || numberOfRandomMembers != previousRandomCounts) {
            if (!lockMembers) {
                lockMembers = true;
                reinitCache = true;
            }
            else {
                mode = previousMode;
                centrality = previousCentrality;
                nextYn = previousNextYn;
                randomList = previousRandomList;
                numberOfRandomMembers = previousRandomCounts;
            }
        }
        // Sinon, si les conditions sont identiques :
        // Si le cache members est dévérouillé, le vérouiller, sinon ne pas réinitialiser le cache
        else if (reinitCache && !lockMembers) {
            lockMembers = true;
        }
        else if (lockMembers) {
            reinitCache = false;
        }
        if (reinitCache) {
            // Réinitialiser le cache
            dataFinder.invalidateCache();
            membersLastUptime = Math.floor(Date.now() / 1000);
            previousMode = mode;
            previousCentrality = centrality;
            previousNextYn = nextYn;
            previousRandomList = randomList;
            previousRandomCounts = numberOfRandomMembers;
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
            sentriesIndex = {};
            countSentries = 0;
            /*meanSentriesReachedBySentriesInSingleExtCert = 0;
            meanMembersReachedBySentriesInSingleExtCert = 0;
            meanSentriesReachedByMembersInSingleExtCert = 0;
            meanMembersReachedByMembersInSingleExtCert = 0;*/
            proportionMembersWithQualityUpper1 = 0;
            proportionMembersWithQualityUpper1IfNoSentries = 0;
            // Appliquer le paramètre nextYn
            if (nextYn == "yes") {
                dSen++;
            }
            // réinitialiser le cache des données de qualité
            membersQuality(constants2_1.MonitConstants.QUALITY_CACHE_ACTION.INIT, 0, dSen, conf.stepMax, conf.xpercent, wotbInstance.memCopy());
            // Réinitialiser le cache des données de centralité
            if (centrality == 'yes') {
                membersLastCentralityCalcTime = Math.floor(Date.now() / 1000);
                membersCentrality = [];
                meanCentrality = 0;
                meanShortestsPathLength = 0;
                nbShortestsPath = 0;
            }
            // Récupérer la liste des membres référents
            sentries = wotbInstance.getSentries(dSen);
            // Récupérer la liste des identités ayant actuellement le statut de membre
            membersList = yield dataFinder.getMembers();
            if (randomList == "yes") {
                // Tirer au sort randomCounts membres
                const maxLengthRandomMembers = Math.min(numberOfRandomMembers, membersList.length);
                let randomMembers = [];
                while (randomMembers.length < maxLengthRandomMembers) {
                    const randomInt_ = randomInt(0, membersList.length);
                    if (randomMembers.indexOf(membersList[randomInt_].uid) == -1) {
                        randomMembers.push(membersList[randomInt_]);
                    }
                }
                membersList = randomMembers;
            }
            else if (uidOrPubList) {
                // Rerchercher les membres qui matchent par l'UID ou la pubkey
                membersList = membersList.filter(m => {
                    return m.uid.toLocaleLowerCase().includes(uidOrPubValue) || m.pub.toLocaleLowerCase().includes(uidOrPubValue);
                });
            }
            // Récupérer pour chaque identité, le numéro du block d'écriture du dernier membership
            // Ainsi que la première ou dernière certification
            for (let m = 0; m < membersList.length; m++) {
                // Récupérer les blockstamp d'écriture et date d'expiration du membership courant du membre m
                let tmpQueryResult = [yield dataFinder.membershipWrittenOnExpiresOn(membersList[m].pub)];
                membershipsExpireTimeList.push(tmpQueryResult[0].expires_on);
                // Extraire le numéro de bloc du blockstamp d'écriture du membership courant
                let blockstampMembershipWritten = tmpQueryResult[0].written_on.split("-"); // Separate blockNumber and blockHash
                membershipsBlockNumberList.push(blockstampMembershipWritten[0]);
                // Extraire le numéro de bloc du blockstamp d'écriture de l'identité du membre
                let blockstampIdtyWritten = membersList[m].written_on.split("-"); // Separate blockNumber and blockHash
                // Récupérer le champ medianTime du bloc d'écriture de l'identité du membre
                let resultQueryTimeWrittenIdty = yield dataFinder.getBlock(blockstampIdtyWritten[0]);
                // Vérifier si le membre est référent
                let currentMemberIsSentry = false;
                sentriesIndex[membersList[m].uid] = false;
                for (let s = 0; s < sentries.length; s++) {
                    if (sentries[s] == membersList[m].wotb_id) {
                        currentMemberIsSentry = true;
                        sentries.splice(s, 1);
                        sentriesIndex[membersList[m].uid] = true;
                    }
                }
                // Réinitialiser le degré de centralité du membre
                if (centrality == 'yes') {
                    membersCentrality[membersList[m].wotb_id] = 0;
                }
                // Créer une wot temporaire
                let tmpWot = wotbInstance.memCopy();
                // Récupérer les informations détaillés de distance pour le membre courant
                let detailedDistance = tmpWot.detailedDistance(membersList[m].wotb_id, dSen, conf.stepMax, conf.xpercent);
                // Calculer le nombre de membres référents
                if (currentMemberIsSentry) {
                    countSentries++;
                }
                // Calculate membersNbSentriesUnreached
                membersNbSentriesUnreached[membersList[m].uid] = parseInt(detailedDistance.nbSentries) - parseInt(detailedDistance.nbSuccess);
                // Calculer la qualité du membre courant
                if (membersQuality(constants2_1.MonitConstants.QUALITY_CACHE_ACTION.GET_QUALITY, membersList[m].wotb_id, (currentMemberIsSentry) ? 1 : 0) >= 1.0) {
                    proportionMembersWithQualityUpper1++;
                }
                // Calculer la qualité du membre courant s'il n'y avait pas de référents (autrement di si tout les membres était référents)
                //let membersQualityIfNoSentries = ((detailedDistanceQualityExt.nbReached/membersList.length)/conf.xpercent).toFixed(2);
                //console.log("membersQualityIfNoSentries[%s] = %s", membersList[m].uid, membersQualityIfNoSentries);
                if (membersQuality(constants2_1.MonitConstants.QUALITY_CACHE_ACTION.GET_QUALITY, membersList[m].wotb_id, -1) >= 1.0) {
                    proportionMembersWithQualityUpper1IfNoSentries++;
                }
                // Nettoyer la wot temporaire
                tmpWot.clear();
                // Stocker les informations de l'identité
                membersIdentity.push({
                    writtenBloc: blockstampIdtyWritten[0],
                    writtenTimestamp: resultQueryTimeWrittenIdty.medianTime,
                    detailedDistance: detailedDistance,
                    isSentry: currentMemberIsSentry
                });
                // récupérer toutes les certification  reçus/émises par l'utilisateur
                let tmpQueryCertifsList = [];
                let tmpOrder = (sort_by == "lastSig") ? 'DESC' : 'ASC';
                if (mode == 'emitted') {
                    tmpQueryCertifsList = yield dataFinder.findCertsOfIssuer(membersList[m].pub, tmpOrder);
                }
                else {
                    tmpQueryCertifsList = yield dataFinder.findCertsOfReceiver(membersList[m].pub, tmpOrder);
                }
                // Calculer le nombre de certifications reçus/émises par le membre courant
                let nbWrittenCertifs = tmpQueryCertifsList.length;
                // Récupérer les uid des émetteurs/receveurs des certifications reçus/émises par l'utilisateur
                // Et stocker les uid et dates d'expiration dans un tableau
                membersCertifsList[m] = new Array();
                for (var i = 0; i < nbWrittenCertifs; i++) {
                    let tmpQueryGetUidProtagonistCert;
                    if (mode == 'emitted') {
                        tmpQueryGetUidProtagonistCert = [yield dataFinder.getProtagonist(tmpQueryCertifsList[i].receiver)];
                    }
                    else {
                        tmpQueryGetUidProtagonistCert = [yield dataFinder.getProtagonist(tmpQueryCertifsList[i].issuer)];
                    }
                    let tmpBlockWrittenOn = tmpQueryCertifsList[i].written_on.split("-");
                    // Stoker la liste des certifications qui n'ont pas encore expirées
                    if (tmpQueryCertifsList[i].expires_on > currentBlockchainTimestamp) {
                        if (i == 0) {
                            membersFirstCertifExpire.push(tmpQueryCertifsList[0].expires_on);
                        }
                        membersCertifsList[m].push({
                            protagonistWotId: tmpQueryGetUidProtagonistCert[0].wotb_id,
                            issuer: (mode == 'emitted') ? membersList[m].uid : tmpQueryGetUidProtagonistCert[0].uid,
                            receiver: (mode != 'emitted') ? membersList[m].uid : tmpQueryGetUidProtagonistCert[0].uid,
                            writtenBloc: tmpBlockWrittenOn[0],
                            timestampExpire: tmpQueryCertifsList[i].expires_on
                        });
                    }
                }
                // Récupérer toutes les certification en piscine
                let nbValidPendingCertifs = 0;
                let tmpQueryPendingCertifsList = [];
                if (mode == 'emitted') {
                    tmpQueryPendingCertifsList = yield dataFinder.getCertsPending(membersList[m].pub, tmpOrder);
                }
                else {
                    tmpQueryPendingCertifsList = yield dataFinder.getCertsPendingFromTo(membersList[m].pub, tmpOrder);
                }
                // Récupérer les uid des émetteurs des certifications reçus par l'utilisateur
                // Et stocker les uid et dates d'expiration dans un tableau
                membersPendingCertifsList[m] = new Array();
                for (var i = 0; i < tmpQueryPendingCertifsList.length; i++) {
                    // Récupérer le medianTime et le hash du bloc d'émission de la certification
                    let emittedBlock = yield dataFinder.getBlock(tmpQueryPendingCertifsList[i].block_number);
                    let tmpPub = (mode == 'emitted') ? tmpQueryPendingCertifsList[i].to : tmpQueryPendingCertifsList[i].from;
                    let tmpQueryGetUidProtagonistPendingCert = yield dataFinder.getUidOfPub(tmpPub);
                    // Vérifier que l'émetteur de la certification correspond à une identié connue
                    if (tmpQueryGetUidProtagonistPendingCert.length > 0) {
                        // Vérifier la validité du blockStamp de la certification en piscine
                        let validBlockStamp = false;
                        if (typeof (emittedBlock) != 'undefined' && emittedBlock.hash == tmpQueryPendingCertifsList[i].block_hash) {
                            validBlockStamp = true;
                        }
                        // Vérifier que le membre courant n'a pas déjà émis/reçu d'autre(s) certification(s) vis à vis du même protagoniste ET dans le même état de validité du blockstamp
                        let doubloonPendingCertif = false;
                        for (const pendingCert of membersPendingCertifsList[m]) {
                            if (pendingCert.protagonist == tmpQueryGetUidProtagonistPendingCert[0].uid && pendingCert.validBlockStamp == validBlockStamp) {
                                doubloonPendingCertif = true;
                            }
                        }
                        if (!doubloonPendingCertif) {
                            // récupérer le timestamp d'écriture de la dernière certification écrite par l'émetteur
                            let tmpQueryLastIssuerCert = yield dataFinder.getChainableOnByIssuerPubkeyByExpOn(tmpQueryPendingCertifsList[i].from);
                            // Stoker la liste des certifications en piscine qui n'ont pas encore expirées
                            if (tmpQueryPendingCertifsList[i].expires_on > currentBlockchainTimestamp) {
                                membersPendingCertifsList[m].push({
                                    protagonist: tmpQueryGetUidProtagonistPendingCert[0].uid,
                                    protagonistIsSentry: sentriesIndex[tmpQueryGetUidProtagonistPendingCert[0].uid],
                                    blockNumber: tmpQueryPendingCertifsList[i].block_number,
                                    timestampExpire: tmpQueryPendingCertifsList[i].expires_on,
                                    timestampWritable: (typeof (tmpQueryLastIssuerCert[0]) == 'undefined') ? 0 : tmpQueryLastIssuerCert[0].chainable_on,
                                    validBlockStamp: validBlockStamp
                                });
                                nbValidPendingCertifs++;
                            }
                        }
                    }
                }
                // Calculer le nombre maximal de certifications reçus par le membre courant
                let nbCertifs = nbWrittenCertifs + nbValidPendingCertifs;
                if (nbCertifs > nbMaxCertifs) {
                    nbMaxCertifs = nbCertifs;
                }
            } // END of members loop
            // Convertir chaque blockNumber (de membership) en timestamp
            for (const membershipBlockNumber of membershipsBlockNumberList) {
                membershipsTimeList.push(yield dataFinder.getBlock(membershipBlockNumber));
            }
            // Traiter les cas ou expires_on est indéfini
            for (let i = 0; i < membershipsExpireTimeList.length; i++) {
                if (membershipsExpireTimeList[i] == null) {
                    // membershipsExpireTimeList[i] = membershipsTimeList[i] + msValidity; ## msValidity is unknown var?
                }
            }
            // Calculer le degré de centralité de tout les membres (si demandé)
            if (centrality == 'yes') {
                let test = '';
                for (const member of membersList) {
                    //if (sentriesIndex[member.uid])
                    //{
                    let tmpWot = wotbInstance.memCopy();
                    for (const member2 of membersList) {
                        if (member.wotb_id != member2.wotb_id) {
                            let paths = tmpWot.getPaths(member.wotb_id, member2.wotb_id, conf.stepMax);
                            if (paths.length > 0) {
                                let shortestPathLength = paths[paths.length - 1].length;
                                meanShortestsPathLength += shortestPathLength;
                                nbShortestsPath++;
                                let indexMembersPresent = new Array();
                                /*for (const path of paths)
                                {
                                    if (path.length < shortestPathLength) { shortestPathLength = path.length; }
                                }*/
                                for (const path of paths) {
                                    //if (path[0] == 0 && path.length == shortestPathLength) { test += "\n"+'0-->'; }
                                    for (let i = 0; i < path.length; i++) {
                                        if (path.length == shortestPathLength && i > 0 && i < (path.length - 1)) {
                                            //if (path[0] == 0) { test += path[i]+'-->'; }
                                            indexMembersPresent[path[i]] = path[i];
                                        }
                                    }
                                    //if (path[0] == 0 && path.length == shortestPathLength) { test += ''+path[path.length-1]; }
                                }
                                for (const indexMember of indexMembersPresent) {
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
        let limitTimestamp = currentBlockchainTimestamp + (days * 86400);
        // trier les membres par ordre croissant/decroissant du critère sort_by
        if (sort_by == "idtyWritten") {
            for (const memberIdentity of membersIdentity) {
                tabSort.push(memberIdentity.writtenTimestamp);
            }
        }
        else if (sort_by == "expireMembership") {
            for (const membershipExpireTimeList of membershipsExpireTimeList) {
                tabSort.push(membershipExpireTimeList);
            }
        }
        else if (sort_by == "lastRenewal") {
            for (const membershipTimeList of membershipsTimeList) {
                tabSort.push(membershipTimeList.medianTime);
            }
        }
        else if (sort_by == "oldestSig" || sort_by == "lastSig") {
            for (const memberCertifsList of membersFirstCertifExpire) {
                tabSort.push(memberCertifsList);
            }
        }
        else if (sort_by == "centrality") {
            for (const member of membersList) {
                if (membersCentrality[member.wotb_id] > 0) {
                    tabSort.push(membersCentrality[member.wotb_id]);
                }
                else {
                    tabSort.push(1);
                }
            }
        }
        else if (sort_by == "quality") {
            for (const member of membersList) {
                tabSort.push(membersQuality(constants2_1.MonitConstants.QUALITY_CACHE_ACTION.GET_QUALITY, member.wotb_id));
            }
        }
        else if (sort_by == "sigCount") {
            for (const memberCertifsList of membersCertifsList) {
                if (memberCertifsList.length > 0) {
                    tabSort.push(memberCertifsList.length + 1);
                }
                else {
                    tabSort.push(1);
                }
            }
        }
        else {
            res.status(500).send(`<pre><p>ERREUR : param <i>sort_by</i> invalid !</p></pre>`);
        } //
        for (var i = 0; i < membersList.length; i++) {
            var maxTime = 0;
            if (order == 'asc') {
                maxTime = currentBlockchainTimestamp + (conf.msValidity * 2);
            } // maxTime = +infiny;
            var idMaxTime = 0;
            for (var j = 0; j < membersList.length; j++) {
                if ((order == 'desc' && tabSort[j] > maxTime)
                    || (order == 'asc' && tabSort[j] > 0 && tabSort[j] < maxTime)) {
                    maxTime = tabSort[j];
                    idMaxTime = j;
                }
            }
            // Push max value on sort table, only if respect days limit
            if (limitTimestamp > membershipsExpireTimeList[idMaxTime]) {
                // Push max value on sort table
                membersListOrdered.push({
                    wotb_id: membersList[idMaxTime].wotb_id,
                    uid: membersList[idMaxTime].uid,
                    pub: membersList[idMaxTime].pub,
                    idtyWrittenTimestamp: membersIdentity[idMaxTime].writtenTimestamp,
                    idtyWrittenBloc: membersIdentity[idMaxTime].writtenBloc,
                    lastRenewalTimestamp: membershipsTimeList[idMaxTime].medianTime,
                    lastRenewalWrittenBloc: membershipsBlockNumberList[idMaxTime],
                    expireMembershipTimestamp: membershipsExpireTimeList[idMaxTime],
                    certifications: membersCertifsList[idMaxTime],
                    pendingCertifications: membersPendingCertifsList[idMaxTime],
                    detailedDistance: membersIdentity[idMaxTime].detailedDistance,
                    percentSentriesReached: parseFloat(((membersIdentity[idMaxTime].detailedDistance.nbSuccess / membersIdentity[idMaxTime].detailedDistance.nbSentries) * 100).toFixed(2)),
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
        if (reinitCache) {
            //Calculate proportionMembersWithQualityUpper1 and proportionMembersWithQualityUpper1IfNoSentries
            proportionMembersWithQualityUpper1 /= membersList.length;
            proportionMembersWithQualityUpper1IfNoSentries /= membersList.length;
            // recalculate meanCentrality and meanShortestsPathLength
            if (centrality == 'yes') {
                for (const member of membersList) {
                    meanCentrality += membersCentrality[member.wotb_id];
                }
                meanCentrality /= membersList.length;
                meanShortestsPathLength /= nbShortestsPath;
            }
            // Dévérouiller le cache members
            lockMembers = false;
        }
        /*// Log a csv Quality - certificationsCount
        for (const member of membersListOrdered)
        {
            console.log("%s %s", membersQuality(member.wotb_id), member.certifications.length);
        }*/
        // Si le client demande la réponse au format JSON =, le faire
        if (format == 'JSON') {
            // Send JSON reponse
            res.status(200).jsonp(membersListOrdered);
        }
        // Sinon, printer le tableau html
        else {
            let meansMembersQuality = membersQuality(constants2_1.MonitConstants.QUALITY_CACHE_ACTION.GET_MEANS);
            res.locals = {
                host: req.headers.host.toString(),
                // get parameters
                days, mode, sort_by, order,
                pendingSigs, centrality, nextYn,
                numberOfRandomMembers: numberOfRandomMembers, randomList,
                // Formulaire de recherche par UID ou PUB
                uidOrPubList, uidOrPubValue,
                // page data
                currentBlockchainTimestamp,
                limitTimestamp, nbMaxCertifs,
                membersListFiltered: membersListOrdered.filter(member => member.expireMembershipTimestamp < limitTimestamp
                    && member.expireMembershipTimestamp > currentBlockchainTimestamp),
                countSentries,
                // currency parameters
                xpercent: conf.xpercent,
                sigWindow: conf.sigWindow,
                idtyWindow: conf.idtyWindow,
                msValidity: conf.msValidity,
                sigValidity: conf.sigValidity,
                stepMax: conf.stepMax,
                // members cache data
                membersLastUptime,
                membersQuality,
                proportionMembersWithQualityUpper1,
                proportionMembersWithQualityUpper1IfNoSentries,
                meansMembersQuality,
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
                color: function (timestamp, idtyWindow, max) {
                    let proportion = ((timestamp - currentBlockchainTimestamp) * max) / idtyWindow;
                    proportion = proportion < 0 ? 0 : proportion > max ? max : proportion;
                    let hex = proportion.toString(16);
                    return `#${hex}${hex}${hex}`;
                },
                /**
                 * background: hsl( ${proportion(item.time,period,1,120)}, 100%, 50%, 1 )
                 * background: hsl( 0, 0%, ${proportion(item.time,period,0,200)}, 1 )
                 * background: #${proportion()}${proportion()}${proportion()}
                 */
                proportion: function (timestamp, maxRange, min, max) {
                    let proportion = ((timestamp - currentBlockchainTimestamp) * max) / maxRange;
                    proportion = proportion < 0 ? 0 : proportion > max ? max : proportion;
                    return proportion;
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
            };
            next();
        }
    }
    catch (e) {
        // En cas d'exception, afficher le message
        res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
    }
});
//# sourceMappingURL=members2.js.map