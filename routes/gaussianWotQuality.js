"use strict";

const co = require('co')

const constants = require(__dirname + '/../lib/constants')
const membersQuality = require(__dirname + '/tools/membersQuality')
const getLang = require(__dirname + '/../lib/getLang')

const wotb = (constants.USE_WOTB6) ? require('wotb'):null;

// gaussianWotQuality cache
var previousNextYn = "no";

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer  } = req.app.locals
  
  try {
    if (!constants.USE_WOTB6)
    {
      res.locals = {
	      host: req.headers.host.toString(),
        form: `gaussianWotQuality page require wotb 0.6.2 or superior, but this version of wotb will be integrated only into duniter 1.4, be patient !`,
        chart: '[]'
      }
      next()
    }
    else
    {
      // get GET parameters
      const format = req.query.format || 'HTML';
      const sentries = req.query.sentries || 'yes';
      const unit = req.query.unit || 'quality';
      const nextYn = (req.query.nextYn=="yes") ? "yes":"no";

      // get lg file
      const LANG = getLang(`${__dirname}/../lg/gaussianWotQuality_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`);

      // Définition des contantes
      const conf = duniterServer.conf;
      const qualityMax = (1/conf.xpercent);

      // Définition des variables
      let lastUpgradeTimeDatas = membersQuality(-1);
      let tabUidIndex = [];
      let tabMembersQuality= [];
      let tabMembersQualitySorted = [];
      let tabLabels = [];
      let tabColors = [];
      let tabLimit1 = [];

      // Récupérer la liste des identités ayant actuellement le statut de membre
      let membersList = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`wotb_id` FROM i_index WHERE `member`=1');

      // Si les données de qualité n'ont jamais été calculés, le faire
      if (lastUpgradeTimeDatas == 0 || (lastUpgradeTimeDatas+constants.MIN_WOT_QUALITY_CACHE_UPDATE_FREQ) < (Math.floor(Date.now() / 1000)) || (previousNextYn != nextYn))
      {
        // Calculer dSen
        var dSen = Math.ceil(Math.pow(membersList.length, 1 / conf.stepMax));
        if (nextYn == "yes") { dSen++; }

        // récupérer la wot
        const wot = wotb.newFileInstance(duniterServer.home + '/wotb.bin');

        // Initialiser le cache des données de qualité
        membersQuality(-1, dSen, conf.stepMax, conf.xpercent, wot.memCopy());
      }

      // Mettre a jour previousNextYn
      previousNextYn = (nextYn=="yes") ? "yes":"no";

      // Calculer nbSentries, limit1 and label
      const nbSentries = (sentries=="no") ? membersList.length:membersQuality(-2);
      let limit1 = 1;
      let label = LANG['QUALITY'];
      switch (unit)
      {
          case 'percentReached': limit1 = conf.xpercent*100; label = LANG['PERCENT_REACHED']; break;
          case 'nbReached': limit1 = parseInt(conf.xpercent*nbSentries); label = LANG['NB_REACHED']; break;
          default: break;
      }

      // Remplir les tableaux tabUidIndex et tabLimit1
      for(const member of membersList)
      {
        tabUidIndex[member.wotb_id] = member.uid;
        tabLimit1.push(limit1);
      }

      // Récupérer le tableau de qualité des membres
      tabMembersQuality= [];
      for (let i=0;membersQuality(i) >= 0;i++)
      {
        if (sentries == "no")
        {
          tabMembersQuality[i] = membersQuality(i, -1);
        }
        else
        {
          tabMembersQuality[i] = membersQuality(i);
        }
      }

      // Initialisation du tableau tabMembersQualitySorted
      for (let i=0;i<tabMembersQuality.length;i++)
      {
        tabMembersQualitySorted.push(0);
      }

      // Trier le tableau de façon gaussienne
      let debut = true;
      let membersQualityAlreadyCounted = [];
      for (let i=0;i<tabMembersQuality.length;i++)
      {
        let min = qualityMax;
        let idMin = 0;

        for (let j=0;j<tabMembersQuality.length;j++)
        {
          if (tabMembersQuality[j] < min && typeof(membersQualityAlreadyCounted[j])=='undefined')
          {
            min = tabMembersQuality[j];
            idMin = j;
          }
        }

        // Remplir les tableaux triée de façon gaussienne
        let idGaussian = parseInt(i/2);
        if(!debut)
        {
          idGaussian = parseInt(tabMembersQuality.length-(i/2));
        }
        debut = !debut;
        tabMembersQualitySorted[idGaussian] = tabMembersQuality[idMin];

        // Exclure les membres déjà traités
        membersQualityAlreadyCounted[idMin] = true;

        // Définir le label pour cet abscisse
        tabLabels[idGaussian] = tabUidIndex[idMin];

        // Définir la couleur
        if (tabMembersQuality[idMin] >= 1.10)
        {
          tabColors[idGaussian] = 'rgba(128, 0, 128, 0.5)';
        }
        else if (tabMembersQuality[idMin] >= 1.05)
        {
          tabColors[idGaussian] = 'rgba(0, 0, 255, 0.5)';
        }
        else if (tabMembersQuality[idMin] >= 1.00)
        {
          tabColors[idGaussian] = 'rgba(0, 255, 0, 0.5)';
        }
        else if (tabMembersQuality[idMin] >= 0.95)
        {
          tabColors[idGaussian] = 'rgba(255, 128, 0, 0.5)';
        }
        else if (tabMembersQuality[idMin] >= 0.90)
        {
          tabColors[idGaussian] = 'rgba(255, 0, 0, 0.5)';
        }
        else
        {
          tabColors[idGaussian] = 'rgba(0, 0, 0, 0.5)';
        }
      }

      // Si le client demande les données dans une autre unité, faire la transformation
      let unitCoeff = 1.0;
      if (unit=='percentReached' || unit=='nbReached')
      {
        unitCoeff = parseFloat(conf.xpercent);
        if (unit=='nbReached') { unitCoeff *= parseFloat(nbSentries); }
        else { unitCoeff *= 100.0; }
        for (let i=0;i<tabMembersQualitySorted.length;i++)
        {
          tabMembersQualitySorted[i] = parseInt(tabMembersQualitySorted[i]*unitCoeff);
        }
      }
      
      // Si le client demande la réponse au format JSON, le faire
      if (format == 'JSON')
      {
        let tabJson = [];
        for (let i=0;i<tabMembersQualitySorted.length;i++)
        {
          tabJson.push({
            label: tabLabels[i],
            quality: tabMembersQualitySorted[i]
          });
        }
        res.status(200).jsonp( tabJson )
      }
      else
      {
        res.locals = {
        host: req.headers.host.toString(),
          form: `
            <select name="unit">
              <option name="unit" value ="quality">${LANG['QUALITY']}
              <option name="unit" value ="percentReached" ${unit == 'percentReached' ? 'selected' : ''}>${LANG['PERCENT_REACHED']}
              <option name="unit" value ="nbReached" ${unit == 'nbReached' ? 'selected' : ''}>${LANG['NB_REACHED']}
            </select>`,
          form2: `<input type="checkbox" name="sentries" value="no" ${sentries == 'no' ? 'checked' : ''}> ${LANG["IF_NO_SENTRIES"]}<br>
            <input type="checkbox" name="nextYn" value="yes" ${nextYn == 'yes' ? 'checked' : ''}> ${LANG["NEXT_YN"]}`,
          chart: {
            type: 'bar',
            data: {
              labels: tabLabels,
              datasets: [{
                label: label,
                data: tabMembersQualitySorted,
                backgroundColor: tabColors,
                borderWidth: 0
              },
              {
                label: 'limit',
                data: tabLimit1,
                backgroundColor: 'rgba(0, 255, 0, 0.5)',
                borderColor: 'rgba(0, 255, 0, 1)',
                borderWidth: 2,
                type: 'line',
                fill: false,
                pointStyle: 'dash'
              }]
            },
            options: {
              title: {
                display: true,
                text: LANG['DISTRIBUTION_QUALITY']
              },
              legend: {
                display: false
              },
              scales: {
                yAxes: [{
                  position: 'left',
                  ticks: {
                    min: 0,
                    max: parseFloat(((1/conf.xpercent)*unitCoeff).toFixed(2))
                  }
                }]
              }
            }
          }
        }
        next()
      }
    }
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
  }
})