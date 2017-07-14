"use strict";

const co = require('co')

const constants = require(__dirname + '/../lib/constants')
const membersQuality = require(__dirname + '/tools/membersQuality')

const wotb = (constants.USE_WOTB6) ? require('wotb'):null;

// gaussianWotQuality cache


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
      let format = req.query.format || 'HTML';

      // Définition des contantes
      const conf = duniterServer.conf;
      const qualityMax = (1/conf.xpercent);

      // Définition des variables
      let lastUpgradeTimeDatas = membersQuality(-1);
      let tabUidIndex = [];
      let tabMembersQuality= [];
      let tabMembersQualityIfNoSentries = [];
      let tabMembersQualitySorted = [];
      let tabMembersQualityIfNoSentriesSorted = [];
      let tabLabels = [];
      let tabColors = [];
      let tabLimit1 = [];

      // Récupérer la liste des identités ayant actuellement le statut de membre
      let membersList = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`wotb_id` FROM i_index WHERE `member`=1');

      // Remplir le tableau tabUidIndex
      for(const member of membersList)
      {
        tabUidIndex[member.wotb_id] = member.uid;
      }

      // Si les données de qualité n'ont jamais été calculés, le faire
      if (lastUpgradeTimeDatas == 0)
      {
        // Calculer dSen
        const dSen = Math.ceil(Math.pow(membersList.length, 1 / conf.stepMax));

        // récupérer la wot
        const wot = wotb.newFileInstance(duniterServer.home + '/wotb.bin');

        // Initialiser le cache des données de qualité
        membersQuality(-1, dSen, conf.stepMax, conf.xpercent, wot.memCopy());
      }

      // Récupérer les tableau de qualités des membres
      tabMembersQuality= [];
      tabMembersQualityIfNoSentries = [];
      for (let i=0;membersQuality(i) >= 0;i++)
      {
        tabMembersQuality[i] = membersQuality(i);
        tabMembersQualityIfNoSentries.push(membersQuality(i, -1));
        //console.log("tabMembersQuality[%s] = %s", i, tabMembersQuality[i]);
        //console.log("tabMembersQualityIfNoSentries[%s] = %s", i, tabMembersQualityIfNoSentries[i]);
      }

      // Initialisation des tableaux Sorted et Limit
      for (let i=0;i<tabMembersQuality.length;i++)
      {
        tabMembersQualitySorted.push(0);
        tabMembersQualityIfNoSentriesSorted.push(0);
        tabLimit1.push(1);
      }

      // Trier chaque tableau de façon gaussienne
      let debut = true;
      let membersQualityAlreadyCounted = [];
      let membersQualityIfNoSentriesAlreadyCounted = [];
      for (let i=0;i<tabMembersQuality.length;i++)
      {
        let min = qualityMax;
        let minIfNoSentries = qualityMax;
        let idMin = 0;
        let idMinIfNoSentries = 0;

        for (let j=0;j<tabMembersQuality.length;j++)
        {
          if (tabMembersQuality[j] < min && typeof(membersQualityAlreadyCounted[j])=='undefined')
          {
            min = tabMembersQuality[j];
            idMin = j;
          }
          if (tabMembersQualityIfNoSentries[j] < minIfNoSentries && typeof(membersQualityIfNoSentriesAlreadyCounted[j])=='undefined')
          {
            minIfNoSentries = tabMembersQuality[j];
            idMinIfNoSentries = j;
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
        tabMembersQualityIfNoSentriesSorted[idGaussian] = tabMembersQualityIfNoSentries[idMinIfNoSentries];

        // Exclure les membres déjà traités
        membersQualityAlreadyCounted[idMin] = true;
        membersQualityIfNoSentriesAlreadyCounted[idMinIfNoSentries] = true;

        // Définir le label pour cet abscisse
        tabLabels[idGaussian] = tabUidIndex[idMin]/*+" ("+tabUidIndex[idMinIfNoSentries]+")"*/;

        // Définir la couleur
        //console.log("membersQuality(%s) = %s", idMin, membersQuality(idMin));
        if (tabMembersQuality[idMin] > 1.1)
        {
          tabColors[idGaussian] = 'rgba(0, 0, 255, 0.5)';
        }
        else if (tabMembersQuality[idMin] > 1.05)
        {
          tabColors[idGaussian] = 'rgba(0, 255, 0, 0.5)';
        }
        else if (tabMembersQuality[idMin] > 1.00)
        {
          tabColors[idGaussian] = 'rgba(255, 128, 0, 0.5)';
        }
        else if (tabMembersQuality[idMin] > 0.95)
        {
          tabColors[idGaussian] = 'rgba(255, 0, 0, 0.5)';
        }
        else
        {
          tabColors[idGaussian] = 'rgba(0, 0, 0, 0.5)';
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
            quality: tabMembersQualitySorted[i],
            qualityIfNoSentries: tabMembersQualityIfNoSentriesSorted[i]
          });
        }
        res.status(200).jsonp( tabJson )
      }
      else
      {
        // GET parameters
        
        res.locals = {
        host: req.headers.host.toString(),
          form: ``,
          chart: {
            type: 'bar',
            data: {
              labels: tabLabels,
              datasets: [{
                label: 'quality',
                data: tabMembersQualitySorted,
                backgroundColor: tabColors,
                borderWidth: 0
              },
              /*{
                label: 'qualityIfNoSentries',
                data: tabMembersQualityIfNoSentriesSorted,
                steppedLine: true,
                pointStyle: 'dash',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderColor: 'rgba(0, 0, 0, 1)',
                borderWidth: 1
              },
              {
                label: 'limit',
                data: tabLimit1,
                backgroundColor: 'rgba(255, 0, 0, 0.5)',
                borderColor: 'rgba(255, 0, 0, 1)',
                borderWidth: 0
              }*/]
            },
            options: {
              title: {
                display: true,
                text: `fonction gaussienne de la qualité des membres`
              },
              legend: {
                display: false
              },
              scales: {
                yAxes: [{
                  position: 'left'
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