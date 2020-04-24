"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const constants2_1 = require("../lib/constants2");
const MonitorExecutionTime_1 = require("../lib/MonitorExecutionTime");
const DataFinder_1 = require("../lib/DataFinder");
// Préserver les résultats en cache
let lockWillMembers = false;
let willMembersLastUptime = 0;
let identitiesList = [];
let idtysPendingCertifsList = [];
let nbMaxCertifs = 0;
let countMembersWithSigQtyValidCert = 0;
let sentries = [];
let sentriesIndex = [];
let wotbIdIndex = [];
let meanSentriesReachedByIdtyPerCert = [];
let meanMembersReachedByIdtyPerCert = [];
let countIdtiesPerReceiveCert = [];
let membersQualityExt = {};
async function willMembers(duniterServer, days = 65, order = 'desc', sort_by = 'registrationPackage', showIdtyWithZeroCert = 'no', sortSig = 'Availability') {
    const dataFinder = await DataFinder_1.DataFinder.getInstanceReindexedIfNecessary();
    // get blockchain timestamp
    let resultQueryCurrentBlock = await dataFinder.getCurrentBlockOrNull();
    const currentBlockchainTimestamp = resultQueryCurrentBlock.medianTime;
    const currentMembersCount = resultQueryCurrentBlock.membersCount;
    const currentBlockNumber = resultQueryCurrentBlock.number;
    // Initaliser les constantes
    const conf = duniterServer.conf;
    const dSen = Math.ceil(Math.pow(currentMembersCount, 1 / conf.stepMax));
    // Initaliser les variables
    let errors = "";
    let idtysListOrdered = [];
    // Calculer le timestamp limite à prendre en compte
    let limitTimestamp = currentBlockchainTimestamp + (days * 86400);
    // Alimenter wotb avec la toile de confiance
    const wotbInstance = duniterServer.dal.wotb;
    // Vérifier si le cache doit être Réinitialiser
    let reinitCache = (Math.floor(Date.now() / 1000) > (willMembersLastUptime + constants2_1.MonitConstants.MIN_WILLMEMBERS_UPDATE_FREQ));
    // Si le cache willMembers est dévérouillé, le vérouiller, sinon ne pas réinitialiser le cache
    if (reinitCache && !lockWillMembers) {
        lockWillMembers = true;
    }
    else if (lockWillMembers) {
        reinitCache = false;
    }
    if (reinitCache) {
        // Réinitialiser le cache
        dataFinder.invalidateCache();
        identitiesList = [];
        idtysPendingCertifsList = [];
        nbMaxCertifs = 0;
        countMembersWithSigQtyValidCert = 0;
        sentries = [];
        sentriesIndex = [];
        wotbIdIndex = [];
        membersQualityExt = {};
        willMembersLastUptime = Math.floor(Date.now() / 1000);
        // Récupérer la liste des membres référents
        sentries = wotbInstance.getSentries(dSen);
        // Récupérer la liste des identités en piscine
        const resultQueryIdtys = await dataFinder.findPendingMembers();
        // Récupérer pour chaque identité, l'ensemble des certifications qu'elle à reçue.
        for (let i = 0; i < resultQueryIdtys.length; i++) {
            // Extraire le numéro de bloc d'émission de l'identité
            let idtyBlockStamp = resultQueryIdtys[i].buid.split("-");
            let idtyBlockNumber = idtyBlockStamp[0];
            // récupérer le medianTime et le hash du bloc d'émission de l'identité
            let idtyEmittedBlock = await dataFinder.getBlock(parseInt(idtyBlockNumber));
            // Récupérer l'identifiant wotex de l'identité (en cas d'identité multiple)
            let idties = await dataFinder.getWotexInfos(resultQueryIdtys[i].uid);
            let wotexId = '';
            if (idties.length > 1) {
                let pos = 0;
                for (const idty of idties) {
                    if (idty.hash == resultQueryIdtys[i].hash) {
                        wotexId = '[' + pos + ']';
                    }
                    pos++;
                }
            }
            // vérifier la validité du blockstamp de l'identité
            let validIdtyBlockStamp = false;
            if (typeof (idtyEmittedBlock) == 'undefined' || idtyEmittedBlock.hash == idtyBlockStamp[1]) {
                validIdtyBlockStamp = true;
            }
            // vérifier si l'identité a été révoquée ou non
            let idtyRevoked = false;
            if (resultQueryIdtys[i].revocation_sig != null) {
                idtyRevoked = true;
            }
            // Stocker les informations de l'identité
            identitiesList.push({
                BlockNumber: parseInt(idtyBlockNumber),
                creationTimestamp: (typeof (idtyEmittedBlock) == 'undefined') ? currentBlockchainTimestamp : idtyEmittedBlock.medianTime,
                pubkey: resultQueryIdtys[i].pubkey,
                uid: resultQueryIdtys[i].uid,
                hash: resultQueryIdtys[i].hash,
                wotexId: wotexId,
                expires_on: resultQueryIdtys[i].expires_on || 0,
                nbCert: 0,
                nbValidPendingCert: 0,
                registrationAvailability: 0,
                validBlockStamp: validIdtyBlockStamp,
                idtyRevoked: idtyRevoked
            });
            idtysPendingCertifsList.push([]);
            // récupérer l'ensemble des certifications en attente destinées à l'identité courante
            let tmpQueryPendingCertifsList = await dataFinder.findPendingCertsToTarget(resultQueryIdtys[i].pubkey, resultQueryIdtys[i].hash);
            // Récupérer les uid des émetteurs des certifications reçus par l'utilisateur
            // Et stocker les uid et dates d'expiration dans un tableau
            for (let j = 0; j < tmpQueryPendingCertifsList.length; j++) {
                // Récupérer le medianTime et le hash du bloc d'émission de la certification
                let emittedBlock = await dataFinder.getBlock(tmpQueryPendingCertifsList[j].block_number);
                // Vérifier que l'émetteur de la certification correspond à une identité inscrite en blockchain
                let tmpQueryGetUidIssuerPendingCert = await dataFinder.getUidOfPub(tmpQueryPendingCertifsList[j].from);
                if (emittedBlock && tmpQueryGetUidIssuerPendingCert.length > 0) {
                    // Récupérer la pubkey de l'émetteur
                    let issuerPubkey = tmpQueryPendingCertifsList[j].from;
                    // Récupérer le wotb_id
                    let wotb_id = 0;
                    if (typeof (wotbIdIndex[issuerPubkey]) == 'undefined') {
                        wotb_id = await dataFinder.getWotbIdByIssuerPubkey(issuerPubkey);
                        wotbIdIndex[issuerPubkey] = wotb_id;
                    }
                    else {
                        wotb_id = wotbIdIndex[issuerPubkey];
                    }
                    // Vérifier si l'émetteur de la certification est référent
                    let issuerIsSentry = false;
                    if (typeof (sentriesIndex[issuerPubkey]) == 'undefined') {
                        sentriesIndex[issuerPubkey] = false;
                        for (let s = 0; s < sentries.length; s++) {
                            if (sentries[s] == wotb_id) {
                                issuerIsSentry = true;
                                sentriesIndex[issuerPubkey] = true;
                                sentries.splice(s, 1);
                            }
                        }
                    }
                    else {
                        issuerIsSentry = sentriesIndex[issuerPubkey];
                    }
                    // Vérifier si le blockstamp est correct
                    var validBlockStamp = false;
                    if (emittedBlock.hash == tmpQueryPendingCertifsList[j].block_hash) {
                        validBlockStamp = true;
                    }
                    // récupérer le timestamp d'enchainement de la dernière certification écrite par l'émetteur
                    let tmpQueryLastIssuerCert = await dataFinder.getChainableOnByIssuerPubkey(issuerPubkey);
                    let certTimestampWritable = 0;
                    if (typeof (tmpQueryLastIssuerCert[0]) != 'undefined' && typeof (tmpQueryLastIssuerCert[0].chainable_on) != 'undefined') {
                        certTimestampWritable = tmpQueryLastIssuerCert[0].chainable_on;
                    }
                    //identitiesList[i].registrationAvailability = (certTimestampWritable > identitiesList[i].registrationAvailability) ? certTimestampWritable : identitiesList[i].registrationAvailability;
                    // Vérifier que l'identité courant n'a pas déjà reçu d'autre(s) certification(s) de la part du même membre ET dans le même état de validité du blockstamp
                    let doubloonPendingCertif = false;
                    for (const pendingCert of idtysPendingCertifsList[i]) {
                        if (pendingCert.from == tmpQueryGetUidIssuerPendingCert[0].uid && pendingCert.validBlockStamp == validBlockStamp) {
                            doubloonPendingCertif = true;
                        }
                    }
                    if (!doubloonPendingCertif) {
                        // Stoker la liste des certifications en piscine qui n'ont pas encore expirées
                        if (tmpQueryPendingCertifsList[j].expires_on > currentBlockchainTimestamp) {
                            idtysPendingCertifsList[i].push({
                                from: tmpQueryGetUidIssuerPendingCert[0].uid,
                                pubkey: issuerPubkey,
                                wotb_id: wotb_id,
                                issuerIsSentry: issuerIsSentry,
                                blockNumber: tmpQueryPendingCertifsList[j].block_number,
                                creationTimestamp: emittedBlock.medianTime,
                                timestampExpire: tmpQueryPendingCertifsList[j].expires_on,
                                timestampWritable: certTimestampWritable,
                                validBlockStamp: validBlockStamp
                            });
                            identitiesList[i].nbCert++;
                            if (validBlockStamp) {
                                identitiesList[i].nbValidPendingCert++;
                            }
                        }
                    }
                }
            }
            // Calculer le nombre maximal de certifications reçues par l'identité courante
            if (identitiesList[i].nbCert > nbMaxCertifs) {
                nbMaxCertifs = identitiesList[i].nbCert;
            }
            // calculate countMembersWithSigQtyValidCert
            if (identitiesList[i].nbValidPendingCert >= conf.sigQty) {
                countMembersWithSigQtyValidCert++;
            }
        } // END IDENTITIES LOOP
        // Réinitialiser sumSentriesReachedByIdtyPerCert, sumMembersReachedByIdtyPerCert et countIdtiesPerReceiveCert
        for (let i = 0; i <= nbMaxCertifs; i++) {
            meanSentriesReachedByIdtyPerCert[i] = 0;
            meanMembersReachedByIdtyPerCert[i] = 0;
            countIdtiesPerReceiveCert[i] = 0;
        }
    } // END if (reinitCache)
    // Si demandé, retrier les, certifications par date de disponibilité
    if (sortSig == "Availability") {
        const idtysPendingCertifsListSort = [[]];
        for (var i = 0; i < idtysPendingCertifsList.length; i++) {
            idtysPendingCertifsListSort[i] = Array();
            let min;
            let idMin = 0;
            let tmpExcluded = Array();
            for (let j = 0; j < idtysPendingCertifsList[i].length; j++) {
                tmpExcluded[j] = false;
            }
            for (let j = 0; j < idtysPendingCertifsList[i].length; j++) {
                min = currentBlockchainTimestamp + conf.sigValidity; // begin to min = max
                // search idMin (id of certif with min timestampWritable)
                for (let k = 0; k < idtysPendingCertifsList[i].length; k++) {
                    if (idtysPendingCertifsList[i][k].timestampWritable < min && !tmpExcluded[k]) {
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
                    creationTimestamp: idtysPendingCertifsList[i][idMin].creationTimestamp,
                    timestampExpire: idtysPendingCertifsList[i][idMin].timestampExpire,
                    timestampWritable: idtysPendingCertifsList[i][idMin].timestampWritable,
                    validBlockStamp: idtysPendingCertifsList[i][idMin].validBlockStamp
                });
                // Calculer la date de disponibilité du dossier d'inscription de l'identité correspondante
                // := date de disponibilité maximale parmi les sigQty certifications aux dates de disponibilités les plus faibles
                if (j < conf.sigQty) {
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
    if (sort_by == "creationIdty") {
        for (const idty of identitiesList) {
            tabSort.push(idty.expires_on);
        }
    }
    else if (sort_by == "sigCount" || sort_by == "registrationPackage") {
        for (const idty of identitiesList) {
            // Calculate registrationAvailabilityDelay
            let registrationAvailabilityDelay = (idty.registrationAvailability > currentBlockchainTimestamp) ? (idty.registrationAvailability - currentBlockchainTimestamp) : 0;
            // Trier les identités par date de disponibilité de leur dossier d'inscription (le signe moins est nécessaire car plus un dossier est disponible tôt
            //  plus la valeur de registrationAvailabilityDelay sera petite, hors le nombre obtenu est classé de façon décroissante)
            // Attribuer un malus de 2*sigValidity secondes par certification valide (plafonner à sigQty dans le cas de 'registrationPackage')
            if (sort_by == "registrationPackage" && idty.nbValidPendingCert > conf.sigQty) {
                tabSort.push(-registrationAvailabilityDelay + (2 * conf.sigValidity * conf.sigQty));
            }
            else {
                tabSort.push(-registrationAvailabilityDelay + (2 * conf.sigValidity * idty.nbValidPendingCert));
            }
        }
    }
    else {
        errors += "<p>ERREUR : param <i>sort_by</i> invalid !</p>";
    }
    // Trier les identités par ordre decroissant du critère sort_by
    for (var i = 0; i < identitiesList.length; i++) {
        let max = -1;
        let idMax = 0;
        for (var j = 0; j < identitiesList.length; j++) {
            if (tabSort[j] > max) {
                max = tabSort[j];
                idMax = j;
            }
        }
        // Push max value on sort table, only if respect days limit
        if (limitTimestamp > identitiesList[idMax].expires_on) {
            // Vérifier que cette identité n'a pas déjà été prise en compte (empecher les doublons)
            let doubloon = false;
            for (const idty of idtysListOrdered) {
                if (identitiesList[idMax].uid == idty.uid && identitiesList[idMax].BlockNumber == idty.BlockNumber) {
                    doubloon = true;
                }
            }
            // Push max value on sort table (and test distance rule)
            if (!doubloon) {
                // Tester la présence de l'adhésion
                let membership = null;
                const pendingMembershipsOfIdty = await duniterServer.dal.msDAL.getPendingINOfTarget(identitiesList[idMax].hash);
                for (const ms of pendingMembershipsOfIdty) {
                    if (!membership && ms.expires_on > currentBlockchainTimestamp) {
                        membership = ms;
                    }
                }
                // Créer une wot temporaire
                let tmpWot = wotbInstance.memCopy();
                // Mesurer la qualité externe de chaque emetteur de chaque certification
                for (const cert of idtysPendingCertifsList[idMax]) {
                    if (typeof (membersQualityExt[cert.from]) == 'undefined') {
                        const detailedDistanceQualityExt = tmpWot.detailedDistance(cert.wotb_id, dSen, conf.stepMax - 1, conf.xpercent);
                        membersQualityExt[cert.from] = ((detailedDistanceQualityExt.nbSuccess / detailedDistanceQualityExt.nbSentries) / conf.xpercent).toFixed(2);
                    }
                }
                // Ajouter un noeud a la wot temporaire et lui donner toute les certifications valides reçues par l'indentité idMax
                let pendingIdtyWID = tmpWot.addNode();
                for (const cert of idtysPendingCertifsList[idMax]) {
                    if (cert.validBlockStamp) {
                        tmpWot.addLink(cert.wotb_id, pendingIdtyWID);
                    }
                }
                // Récupérer les données de distance du dossier d'adhésion de l'indentité idMax
                let detailedDistance = tmpWot.detailedDistance(pendingIdtyWID, dSen, conf.stepMax, conf.xpercent);
                // Nettoyer la wot temporaire
                tmpWot.clear();
                // Calculer percentSentriesReached et percentMembersReached
                let percentSentriesReached = parseFloat(((detailedDistance.nbSuccess / detailedDistance.nbSentries) * 100).toFixed(2));
                let percentMembersReached = parseFloat(((detailedDistance.nbReached / currentMembersCount) * 100).toFixed(2));
                // Pousser l'identité dans le tableau idtysListOrdered
                idtysListOrdered.push({
                    uid: identitiesList[idMax].uid,
                    wotexId: identitiesList[idMax].wotexId,
                    creationTimestamp: identitiesList[idMax].creationTimestamp,
                    pubkey: identitiesList[idMax].pubkey,
                    BlockNumber: identitiesList[idMax].BlockNumber,
                    expires_on: identitiesList[idMax].expires_on,
                    nbCert: identitiesList[idMax].nbCert,
                    registrationAvailability: identitiesList[idMax].registrationAvailability,
                    nbValidPendingCert: identitiesList[idMax].nbValidPendingCert,
                    detailedDistance,
                    percentSentriesReached,
                    percentMembersReached,
                    membership,
                    pendingCertifications: idtysPendingCertifsList[idMax],
                    validBlockStamp: identitiesList[idMax].validBlockStamp,
                    idtyRevoked: identitiesList[idMax].idtyRevoked
                });
                // Si le cache a été réinitialiser, recalculer les sommes meanSentriesReachedByIdtyPerCert et meanMembersReachedByIdtyPerCert
                if (reinitCache && identitiesList[idMax].nbValidPendingCert > 0) {
                    let nbReceiveCert = identitiesList[idMax].nbValidPendingCert;
                    meanSentriesReachedByIdtyPerCert[nbReceiveCert - 1] += percentSentriesReached;
                    meanMembersReachedByIdtyPerCert[nbReceiveCert - 1] += percentMembersReached;
                    countIdtiesPerReceiveCert[nbReceiveCert - 1] += 1;
                }
            } // END if (!doubloon)
        } // END days limit rule
        // Exclure la valeur max avant de poursuivre le tri
        tabSort[idMax] = -1;
    } // End sort identities loop
    // Si ordre croissant demandé, inverser le tableau
    if (order == 'asc') {
        const idtysListOrdered2 = [];
        let tmpIdtysListOrderedLength = idtysListOrdered.length;
        for (let i = 0; i < tmpIdtysListOrderedLength; i++) {
            idtysListOrdered2[i] = idtysListOrdered[tmpIdtysListOrderedLength - i - 1];
        }
        idtysListOrdered = idtysListOrdered2;
    }
    if (reinitCache) {
        // Calculate meanSentriesReachedByIdtyPerCert and meanMembersReachedByIdtyPerCert
        for (let i = 0; i <= nbMaxCertifs; i++) {
            if (countIdtiesPerReceiveCert[i] > 0) {
                meanSentriesReachedByIdtyPerCert[i] = parseFloat((meanSentriesReachedByIdtyPerCert[i] / countIdtiesPerReceiveCert[i]).toFixed(2));
                meanMembersReachedByIdtyPerCert[i] = parseFloat((meanMembersReachedByIdtyPerCert[i] / countIdtiesPerReceiveCert[i]).toFixed(2));
            }
            else {
                meanSentriesReachedByIdtyPerCert[i] = 0.0;
                meanMembersReachedByIdtyPerCert[i] = 0.0;
            }
        }
        // Dévérouiller le cache willMembers
        lockWillMembers = false;
    }
    MonitorExecutionTime_1.showExecutionTimes();
    return {
        days,
        order,
        sort_by,
        showIdtyWithZeroCert,
        sortSig,
        idtysListOrdered,
        currentBlockNumber,
        currentBlockchainTimestamp,
        currentMembersCount,
        limitTimestamp,
        dSen,
        conf,
        nbMaxCertifs,
        countMembersWithSigQtyValidCert,
        meanSentriesReachedByIdtyPerCert,
        meanMembersReachedByIdtyPerCert,
        membersQualityExt,
    };
}
exports.willMembers = willMembers;
//# sourceMappingURL=will-members.js.map