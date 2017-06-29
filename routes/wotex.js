"use strict";

const _ = require('underscore')
const co = require('co')
const getLang = require(__dirname + '/../lib/getLang')

const MAX_STEP_LOOK = 7

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow, cache  } = req.app.locals

    try {
      // get GET parameters
      var format = req.query.format || 'HTML';
      
      // get lg file
      const LANG = getLang(`${__dirname}/../lg/wotex_${req.query.lg||'fr'}.txt`);
      
      // Trouve les points de contrôle efficacement grâce au module C (nommé "wotb")
      const wotb = duniterServer.dal.wotb.memCopy();
      wotb.setMaxCert(100);
      const head = yield duniterServer.dal.getCurrentBlockOrNull();
      const membersCount = head ? head.membersCount : 0;
      let dSen = Math.ceil(Math.pow(membersCount, 1 / duniterServer.conf.stepMax));
      const dicoIdentites = {};
      const pointsDeControle = wotb.getSentries(dSen);
      const sentries = yield pointsDeControle.map((wotb_id) => co(function*() {
        const identite = (yield duniterServer.dal.idtyDAL.query('SELECT * FROM i_index WHERE wotb_id = ?', [wotb_id]))[0];
        identite.statusClass = 'isSentry';
        dicoIdentites[identite.wotb_id] = identite;
        return identite;
      }));

      let searchResult = '';
      if (req.query.to) {
        let idty;
        let pos = 0, search = req.query.to;
        if (req.query.to.match(/(\[|\])/)) {
          const match = req.query.to.match(/^(.+)(\[\d+\])!?$/);
          search = match[1];
          pos = parseInt(match[2].replace(/(\[|\])/g, ''));
        }
        let idties = yield duniterServer.dal.idtyDAL.query('' +
          'SELECT uid, pub, wotb_id FROM i_index WHERE (uid = ? or pub = ?) ' +
          'UNION ALL ' +
          'SELECT uid, pubkey as pub, (SELECT NULL) AS wotb_id FROM idty WHERE (uid = ? or pubkey = ?)', [search, search, search, search]);
        idty = idties[pos];
        if (!idty) {
          searchResult = `
                  <p>UID or public key « ${req.query.to} » is not known in the WoT nor in the sandboxes.</p>
                `;
        } else if (!req.query.pending && idty.wotb_id === null) {
          searchResult = `
                  <p>UID or public key « ${req.query.to} » requires the "Include sandbox's data" option to be enabled.</p>
                `;
        } else {

          let membres = yield prepareMembresInitiaux(wotb, dSen, sentries, dicoIdentites, duniterServer);

          const res = yield prepareMembres(req, wotb, duniterServer, membres, idty, dicoIdentites);
          membres = res.membres;
          idty = res.idty;
          const mapPendingCerts = res.mapPendingCerts;

          let lignes = [];
          for (const membre of membres) {
            if (req.query.mode == "u2w") {
              alimenteLignes(wotb, idty, membre, lignes, dicoIdentites, mapPendingCerts);
            } else {
              alimenteLignes(wotb, membre, idty, lignes, dicoIdentites, mapPendingCerts);
            }
          }
          searchResult = genereHTMLdeRecherche(lignes, LANG);
        }
      }

      // Si le client demande la réponse au format JSON, le faire
      if (format == 'JSON')
      {
	// Send JSON reponse
	//res.status(200).jsonp( ? )
      }
      // Sinon, printer la page html
      else
      {
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
	}
	next()
      }
    } catch (e) {
      // En cas d'exception, afficher le message
      res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }

  });

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
  } else {
    return [];
  }
}

function prepareMembresInitiaux(wotb, dSen, sentries, dicoIdentites, duniterServer) {
  return co(function*() {
    // Ajout des membres non-sentries
    const pointsNormaux = wotb.getNonSentries(dSen);
    const nonSentries = yield pointsNormaux.map((wotb_id) => co(function*() {
      const identite = (yield duniterServer.dal.idtyDAL.query('SELECT * FROM i_index WHERE wotb_id = ?', [wotb_id]))[0];
      identite.statusClass = 'isMember';
      dicoIdentites[identite.wotb_id] = identite;
      return identite;
    }));
    const nonMembres = wotb.getDisabled();
    const disabled = yield nonMembres.map((wotb_id) => co(function*() {
      const identite = (yield duniterServer.dal.idtyDAL.query('SELECT * FROM i_index WHERE wotb_id = ?', [wotb_id]))[0];
      identite.statusClass = 'isNonMember';
      dicoIdentites[identite.wotb_id] = identite;
      return identite;
    }));

    return sentries.concat(nonSentries).concat(disabled);
  });
}

function prepareMembres(req, wotb, duniterServer, membres, idty, dicoIdentites) {
  return co(function*() {
    const mapPendingCerts = {};
    const mapPendingIdties = {};
    const mapSiblings = {};
    if (req.query.pending) {
      // Recherche les identités en attente
      const pendingIdties = yield duniterServer.dal.idtyDAL.sqlListAll();
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
        } else {
          if (theIdty.uid == req.query.to) {
            idty = theIdty;
          }
        }
        dicoIdentites[theIdty.wotb_id] = theIdty;
        mapPendingIdties[theIdty.wotb_id] = theIdty;
      }

      membres = membres.concat(Object.values(mapPendingIdties));

      // Recherche les certifications en attente
      const pendingCerts = yield duniterServer.dal.certDAL.sqlListAll();
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
  });
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
  } else {
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

function genereHTMLdeRecherche(lignes, LANG) {
  lignes.sort((ligneA, ligneB) => {
    if (ligneA.length > ligneB.length) return -1;
    if (ligneB.length > ligneA.length) return 1;
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
      <td class="${ colonnes[0] && colonnes[0].statusClass }"><a href="wotex?lg=${LANG['LG']}&to=${ (colonnes[0] && colonnes[0].uid) || ''}">${ (colonnes[0] && colonnes[0].uid) || ''}</td>
      <td class="${ colonnes[1] && colonnes[1].pendingCert ? 'isPendingCert' : '' }">${ (colonnes[1] && colonnes[1].uid) ? '->' : ''}</td>
      <td class="${ colonnes[1] && colonnes[1].statusClass }"><a href="wotex?lg=${LANG['LG']}&to=${ (colonnes[1] && colonnes[1].uid) || ''}">${ (colonnes[1] && colonnes[1].uid) || ''}</td>
      <td class="${ colonnes[2] && colonnes[2].pendingCert ? 'isPendingCert' : '' }">${ (colonnes[2] && colonnes[2].uid) ? '->' : ''}</td>
      <td class="${ colonnes[2] && colonnes[2].statusClass }"><a href="wotex?lg=${LANG['LG']}&to=${ (colonnes[2] && colonnes[2].uid) || ''}">${ (colonnes[2] && colonnes[2].uid) || ''}</td>
      <td class="${ colonnes[3] && colonnes[3].pendingCert ? 'isPendingCert' : '' }">${ (colonnes[3] && colonnes[3].uid) ? '->' : ''}</td>
      <td class="${ colonnes[3] && colonnes[3].statusClass }"><a href="wotex?lg=${LANG['LG']}&to=${ (colonnes[3] && colonnes[3].uid) || ''}">${ (colonnes[3] && colonnes[3].uid) || ''}</td>
      <td class="${ colonnes[4] && colonnes[4].pendingCert ? 'isPendingCert' : '' }">${ (colonnes[4] && colonnes[4].uid) ? '->' : ''}</td>
      <td class="${ colonnes[4] && colonnes[4].statusClass }"><a href="wotex?lg=${LANG['LG']}&to=${ (colonnes[4] && colonnes[4].uid) || ''}">${ (colonnes[4] && colonnes[4].uid) || ''}</td>
      <td class="${ colonnes[5] && colonnes[5].pendingCert ? 'isPendingCert' : '' }">${ (colonnes[5] && colonnes[5].uid) ? '->' : ''}</td>
      <td class="isMax ${ colonnes[5] && colonnes[5].statusClass }"><a href="wotex?lg=${LANG['LG']}&to=${ (colonnes[5] && colonnes[5].uid) || ''}">${ (colonnes[5] && colonnes[5].uid) || ''}</td>
      <td class="${ colonnes[6] && colonnes[6].pendingCert ? 'isPendingCert' : '' }">${ (colonnes[6] && colonnes[6].uid) ? '->' : ''}</td>
      <td class="${ colonnes[6] && colonnes[6].statusClass }"><a href="wotex?lg=${LANG['LG']}&to=${ (colonnes[6] && colonnes[6].uid) || ''}">${ (colonnes[6] && colonnes[6].uid) || ''}</td>
      <td class="${ colonnes[7] && colonnes[7].pendingCert ? 'isPendingCert' : '' }">${ (colonnes[7] && colonnes[7].uid) ? '->' : ''}</td>
      <td class="${ colonnes[7] && colonnes[7].statusClass }"><a href="wotex?lg=${LANG['LG']}&to=${ (colonnes[7] && colonnes[7].uid) || ''}">${ (colonnes[7] && colonnes[7].uid) || ''}</td>
      <td class="${ colonnes[8] && colonnes[8].pendingCert ? 'isPendingCert' : '' }">${ (colonnes[8] && colonnes[8].uid) ? '->' : ''}</td>
      <td class="${ colonnes[8] && colonnes[8].statusClass }"><a href="wotex?lg=${LANG['LG']}&to=${ (colonnes[8] && colonnes[8].uid) || ''}">${ (colonnes[8] && colonnes[8].uid) || ''}</td>
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
