"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DataFinder_1 = require("../lib/DataFinder");
const constants2_1 = require("../lib/constants2");
const _ = require('underscore');
const getLang = require(__dirname + '/../lib/getLang');
const MAX_STEP_LOOK = 7;
module.exports = async (req, res, next) => {
    var { duniterServer } = req.app.locals;
    const dataFinder = await DataFinder_1.DataFinder.getInstanceReindexedIfNecessary();
    try {
        // get GET parameters
        var format = req.query.format || 'HTML';
        var help = req.query.help || 'yes';
        // get lg file
        const LANG = getLang(`${__dirname}/../lg/wotex_${req.query.lg || constants2_1.MonitConstants.DEFAULT_LANGUAGE}.txt`);
        // Trouve les points de contrôle efficacement grâce au module C (nommé "wotb")
        const wotb = duniterServer.dal.wotb.memCopy();
        wotb.setMaxCert(100);
        const head = await duniterServer.dal.getCurrentBlockOrNull();
        const membersCount = head ? head.membersCount : 0;
        let dSen = Math.ceil(Math.pow(membersCount, 1 / duniterServer.conf.stepMax));
        const dicoIdentites = {};
        const pointsDeControle = wotb.getSentries(dSen);
        const sentries = await Promise.all(pointsDeControle.map(async (wotb_id) => {
            const identite = await dataFinder.getIdentityByWotbid(wotb_id);
            identite.statusClass = 'isSentry';
            dicoIdentites[identite.wotb_id] = identite;
            return identite;
        }));
        let searchResult = '';
        let lignes = [];
        if (req.query.to) {
            let idty;
            let pos = 0, search = req.query.to;
            if (req.query.to.match(/(\[|\])/)) {
                const match = req.query.to.match(/^(.+)(\[\d+\])!?$/);
                search = match[1];
                pos = parseInt(match[2].replace(/(\[|\])/g, ''));
            }
            let idties = await dataFinder.searchIdentities(search);
            idty = idties[pos];
            if (!idty) {
                searchResult = `
                  <p>UID or public key « ${req.query.to} » is not known in the WoT nor in the sandboxes.</p>
                `;
            }
            else if (!req.query.pending && idty.wotb_id === null) {
                searchResult = `
                  <p>UID or public key « ${req.query.to} » requires the "Include sandbox's data" option to be enabled.</p>
                `;
            }
            else {
                let membres = await prepareMembresInitiaux(dataFinder, wotb, dSen, sentries, dicoIdentites, duniterServer);
                const res = await prepareMembres(req, wotb, duniterServer, membres, idty, dicoIdentites);
                membres = res.membres;
                idty = res.idty;
                const mapPendingCerts = res.mapPendingCerts;
                for (const membre of membres) {
                    if (req.query.mode == "u2w") {
                        alimenteLignes(wotb, idty, membre, lignes, dicoIdentites, mapPendingCerts);
                    }
                    else {
                        alimenteLignes(wotb, membre, idty, lignes, dicoIdentites, mapPendingCerts);
                    }
                }
                searchResult = genereHTMLdeRecherche(lignes, LANG, help);
            }
        }
        // Si le client demande la réponse au format JSON, le faire
        if (format == 'JSON') {
            // Send JSON reponse
            res.status(200).jsonp(lignes);
        }
        // Sinon, printer la page html
        else {
            // write sentriesHTML
            let sentriesHTML = sentries
                .map((sentry) => `
					<div class="sentry isSentry"><a href="wotex?lg=${LANG['LG']}&to=${sentry.uid}">${sentry.uid}</a></div>
							`)
                .join('');
            res.locals = {
                // Les varibles à passer au template
                host: req.headers.host.toString(),
                searchResult,
                sentriesHTML
            };
            next();
        }
    }
    catch (e) {
        // En cas d'exception, afficher le message
        res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
};
function traduitCheminEnIdentites(chemins, dicoIdentites) {
    const cheminsTries = chemins.sort((cheminA, cheminB) => {
        if (cheminA.length < cheminB.length) {
            return -1;
        }
        if (cheminA.length > cheminB.length) {
            return 1;
        }
        return 0;
    });
    if (cheminsTries[0]) {
        return cheminsTries[0].slice().map((wotb_id) => {
            return {
                uid: dicoIdentites[wotb_id].uid,
                pub: dicoIdentites[wotb_id].pub,
                wotb_id: wotb_id,
                statusClass: dicoIdentites[wotb_id].statusClass
            };
        });
    }
    else {
        return [];
    }
}
async function prepareMembresInitiaux(dataFinder, wotb, dSen, sentries, dicoIdentites, duniterServer) {
    // Ajout des membres non-sentries
    const pointsNormaux = wotb.getNonSentries(dSen);
    const nonSentries = await Promise.all(pointsNormaux.map(async (wotb_id) => {
        const identite = await dataFinder.getIdentityByWotbid(wotb_id);
        identite.statusClass = 'isMember';
        dicoIdentites[identite.wotb_id] = identite;
        return identite;
    }));
    const nonMembres = wotb.getDisabled();
    const disabled = await Promise.all(nonMembres.map(async (wotb_id) => {
        const identite = await dataFinder.getIdentityByWotbid(wotb_id);
        identite.statusClass = 'isNonMember';
        dicoIdentites[identite.wotb_id] = identite;
        return identite;
    }));
    return sentries.concat(nonSentries).concat(disabled);
}
async function prepareMembres(req, wotb, duniterServer, membres, idty, dicoIdentites) {
    const mapPendingCerts = {};
    const mapPendingIdties = {};
    const mapSiblings = {};
    if (req.query.pending) {
        // Recherche les identités en attente
        const pendingIdties = await duniterServer.dal.idtyDAL.sqlListAll();
        for (const theIdty of pendingIdties) {
            // Add it to the temp wot
            theIdty.wotb_id = wotb.addNode();
            theIdty.statusClass = 'isPending';
            theIdty.pub = theIdty.pubkey;
            const siblings = _.where(pendingIdties, { uid: theIdty.uid });
            if (siblings.length > 1 || mapSiblings[theIdty.uid] !== undefined) {
                const initialUID = theIdty.uid;
                mapSiblings[initialUID] = (mapSiblings[initialUID] || 0);
                theIdty.uid += "[" + mapSiblings[initialUID] + "]";
                if (theIdty.uid == req.query.to) {
                    idty = theIdty;
                }
                mapSiblings[initialUID]++;
            }
            else {
                if (theIdty.uid == req.query.to) {
                    idty = theIdty;
                }
            }
            dicoIdentites[theIdty.wotb_id] = theIdty;
            mapPendingIdties[theIdty.wotb_id] = theIdty;
        }
        membres = membres.concat(Object.values(mapPendingIdties));
        // Recherche les certifications en attente
        const pendingCerts = await duniterServer.dal.certDAL.sqlListAll();
        for (const cert of pendingCerts) {
            const from = _.findWhere(membres, { pub: cert.from });
            const target = _.findWhere(membres, { hash: cert.target });
            if (target && from) {
                wotb.addLink(from.wotb_id, target.wotb_id);
                mapPendingCerts[[from.wotb_id, target.wotb_id].join('-')] = true;
            }
        }
    }
    return { idty, membres, mapPendingCerts };
}
function alimenteLignes(wotb, source, cible, lignes, dicoIdentites, mapPendingCerts) {
    const plusCourtsCheminsPossibles = wotb.getPaths(source.wotb_id, cible.wotb_id, MAX_STEP_LOOK);
    if (plusCourtsCheminsPossibles.length) {
        const ligne = traduitCheminEnIdentites(plusCourtsCheminsPossibles, dicoIdentites);
        for (let i = 0; i < ligne.length - 1; i++) {
            const from_wid = ligne[i].wotb_id;
            const to_wid = ligne[i + 1].wotb_id;
            const lien = [from_wid, to_wid].join('-');
            if (mapPendingCerts[lien]) {
                ligne[i + 1].pendingCert = true;
            }
        }
        lignes.push(ligne);
    }
    else {
        const identiteObservee = dicoIdentites[source.wotb_id];
        if (identiteObservee.uid != cible.uid) {
            lignes.push([identiteObservee,
                { uid: '?', statusClass: 'isPending', pendingCert: true },
                { uid: '?', statusClass: 'isPending', pendingCert: true },
                { uid: '?', statusClass: 'isPending', pendingCert: true },
                { uid: '?', statusClass: 'isPending', pendingCert: true },
                { uid: '?', statusClass: 'isPending', pendingCert: true },
                cible]);
        }
    }
}
function genereHTMLdeRecherche(lignes, LANG, help) {
    lignes.sort((ligneA, ligneB) => {
        if (ligneA.length > ligneB.length)
            return -1;
        if (ligneB.length > ligneA.length)
            return 1;
        if ((ligneA[1] && ligneA[1] == '?') && (!ligneB[1] || ligneB[1] != '?')) {
            return 1;
        }
        if ((ligneB[1] && ligneB[1] == '?') && (!ligneA[1] || ligneA[1] != '?')) {
            return -1;
        }
        return 0;
    });
    lignes.reverse();
    const chemins = lignes.map((colonnes) => {
        return `
    <tr>
      <td class="${colonnes[0] && colonnes[0].statusClass}"><a href="wotex?lg=${LANG['LG']}&help=${help}&to=${(colonnes[0] && colonnes[0].uid) || ''}">${(colonnes[0] && colonnes[0].uid) || ''}</td>
      <td class="${colonnes[1] && colonnes[1].pendingCert ? 'isPendingCert' : ''}">${(colonnes[1] && colonnes[1].uid) ? '->' : ''}</td>
      <td class="${colonnes[1] && colonnes[1].statusClass}"><a href="wotex?lg=${LANG['LG']}&help=${help}&to=${(colonnes[1] && colonnes[1].uid) || ''}">${(colonnes[1] && colonnes[1].uid) || ''}</td>
      <td class="${colonnes[2] && colonnes[2].pendingCert ? 'isPendingCert' : ''}">${(colonnes[2] && colonnes[2].uid) ? '->' : ''}</td>
      <td class="${colonnes[2] && colonnes[2].statusClass}"><a href="wotex?lg=${LANG['LG']}&help=${help}&to=${(colonnes[2] && colonnes[2].uid) || ''}">${(colonnes[2] && colonnes[2].uid) || ''}</td>
      <td class="${colonnes[3] && colonnes[3].pendingCert ? 'isPendingCert' : ''}">${(colonnes[3] && colonnes[3].uid) ? '->' : ''}</td>
      <td class="${colonnes[3] && colonnes[3].statusClass}"><a href="wotex?lg=$&help=${help}&to=${(colonnes[3] && colonnes[3].uid) || ''}">${(colonnes[3] && colonnes[3].uid) || ''}</td>
      <td class="${colonnes[4] && colonnes[4].pendingCert ? 'isPendingCert' : ''}">${(colonnes[4] && colonnes[4].uid) ? '->' : ''}</td>
      <td class="${colonnes[4] && colonnes[4].statusClass}"><a href="wotex?lg=${LANG['LG']}&help=${help}&to=${(colonnes[4] && colonnes[4].uid) || ''}">${(colonnes[4] && colonnes[4].uid) || ''}</td>
      <td class="${colonnes[5] && colonnes[5].pendingCert ? 'isPendingCert' : ''}">${(colonnes[5] && colonnes[5].uid) ? '->' : ''}</td>
      <td class="isMax ${colonnes[5] && colonnes[5].statusClass}"><a href="wotex?lg=${LANG['LG']}&help=${help}&to=${(colonnes[5] && colonnes[5].uid) || ''}">${(colonnes[5] && colonnes[5].uid) || ''}</td>
      <td class="${colonnes[6] && colonnes[6].pendingCert ? 'isPendingCert' : ''}">${(colonnes[6] && colonnes[6].uid) ? '->' : ''}</td>
      <td class="${colonnes[6] && colonnes[6].statusClass}"><a href="wotex?lg=${LANG['LG']}&help=${help}&to=${(colonnes[6] && colonnes[6].uid) || ''}">${(colonnes[6] && colonnes[6].uid) || ''}</td>
      <td class="${colonnes[7] && colonnes[7].pendingCert ? 'isPendingCert' : ''}">${(colonnes[7] && colonnes[7].uid) ? '->' : ''}</td>
      <td class="${colonnes[7] && colonnes[7].statusClass}"><a href="wotex?lg=${LANG['LG']}&help=${help}&to=${(colonnes[7] && colonnes[7].uid) || ''}">${(colonnes[7] && colonnes[7].uid) || ''}</td>
      <td class="${colonnes[8] && colonnes[8].pendingCert ? 'isPendingCert' : ''}">${(colonnes[8] && colonnes[8].uid) ? '->' : ''}</td>
      <td class="${colonnes[8] && colonnes[8].statusClass}"><a href="wotex?lg=${LANG['LG']}&help=${help}&to=${(colonnes[8] && colonnes[8].uid) || ''}">${(colonnes[8] && colonnes[8].uid) || ''}</td>
    </tr>
  `;
    }).join('');
    return `
    <table>
      <tr>
        <th>${LANG['STEP']} 0</th>
        <th class="arrow">-></th>
        <th>${LANG['STEP']} 1</th>
        <th class="arrow">-></th>
        <th>${LANG['STEP']} 2</th>
        <th class="arrow">-></th>
        <th>${LANG['STEP']} 3</th>
        <th class="arrow">-></th>
        <th>${LANG['STEP']} 4</th>
        <th class="arrow">-></th>
        <th class="isMax">${LANG['STEP']} 5 (${LANG['MAX']})</th>
        <th class="arrow">-></th>
        <th>${LANG['STEP']} 6</th>
        <th class="arrow">-></th>
        <th>${LANG['STEP']} 7</th>
        <th class="arrow">-></th>
        <th>${LANG['INFINITY']}</th>
      </tr>
      ${chemins}
    </table>
  `;
}
//# sourceMappingURL=wotex2.js.map