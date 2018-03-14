const constants = require(__dirname + '/../../lib/constants')

// membersQuality cache
var lastUpgradeTime = 0;
var wot = null;
var membersCount = 0;
var sentriesCount = 0;
var conf = {
	dSen : 0,
	stepMax: 0,
	xprecent: 1.0
};
var tabMembersQuality = [];
var tabMembersQualityIfNoSentries = [];
var tabMembersQualityDetailedDistance = [];
var meansCalculate = false;
var means = {
	meanSentriesReachedBySentries: 0,
	meanMembersReachedBySentries: 0,
	meanSentriesReachedByMembers: 0,
	meanMembersReachedByMembers: 0
};

module.exports = function membersQuality(action, wotb_id = 0, dSen = 0, stepMax = 0, xpercent = 0, wotCopy = null) {

  	if (action == constants.QUALITY_CACHE_ACTION.GET_QUALITY) {
		if (typeof(tabMembersQuality[wotb_id])=='undefined')
		{
			// Si le wotb_id n'existe pas, renvoyer -1
			if (wotb_id > membersCount)
			{
				return -1;
			}

			// Récupérer les informations détaillés de distance pour une nouvelle identité qui ne serait certifiée que par le membre courant (ce qui équivaut à récupérer les informations de distance pour le membre courant en décrémentant stepMax de 1)
			let detailedDistance = wot.detailedDistance(wotb_id, conf.dSen, conf.stepMax-1, conf.xpercent);

			// Calculer la qualité du membre
			tabMembersQuality[wotb_id] = parseFloat(((detailedDistance.nbSuccess/detailedDistance.nbSentries)/conf.xpercent).toFixed(2));
			tabMembersQualityIfNoSentries[wotb_id] = parseFloat(((detailedDistance.nbReached/membersCount)/conf.xpercent).toFixed(2));

			if (dSen > 0)
			{
				means.meanSentriesReachedBySentries += parseFloat(((detailedDistance.nbSuccess/detailedDistance.nbSentries)*100).toFixed(2));
				means.meanMembersReachedBySentries += parseFloat(((detailedDistance.nbReached/membersCount)*100).toFixed(2));
			}
			means.meanSentriesReachedByMembers += parseFloat(((detailedDistance.nbSuccess/detailedDistance.nbSentries)*100).toFixed(2));
			means.meanMembersReachedByMembers += parseFloat(((detailedDistance.nbReached/membersCount)*100).toFixed(2));
		}
		if (dSen < 0)
		{
			return tabMembersQualityIfNoSentries[wotb_id];
		}
		else
		{
			return tabMembersQuality[wotb_id];
		}
	}
	else if (action == constants.QUALITY_CACHE_ACTION.GET_MEANS) {
		if (!meansCalculate)
		{
			// Calculate mean Members/Sentries ReachedBy Members/Sentries
			if (sentriesCount > 0)
			{
				means.meanSentriesReachedBySentries = parseFloat((means.meanSentriesReachedBySentries/sentriesCount).toFixed(2));
				means.meanMembersReachedBySentries = parseFloat((means.meanMembersReachedBySentries/sentriesCount).toFixed(2));
			}
			if (membersCount > 0)
			{
				means.meanSentriesReachedByMembers = parseFloat((means.meanSentriesReachedByMembers/membersCount).toFixed(2));
				means.meanMembersReachedByMembers = parseFloat((means.meanMembersReachedByMembers/membersCount).toFixed(2));
			}
			meansCalculate = true;
		}

		return means;
	}
	else if (action == constants.QUALITY_CACHE_ACTION.INIT) {
		if (wot != null)
		{
			wot.clear();
			wot = null
		}
		if (wotCopy != null)
		{
			lastUpgradeTime = Math.floor(Date.now() / 1000);
			
			wot = wotCopy;
			membersCount = wot.getWoTSize()-wot.getDisabled().length;
			sentriesCount = wot.getSentries(dSen).length;
			conf.dSen = dSen;
			conf.stepMax = stepMax;
			conf.xpercent = xpercent;

			tabMembersQuality = [];
			tabMembersQualityIfNoSentries = [];

			meansCalculate = false;
			means.meanSentriesReachedBySentries = 0;
			means.meanMembersReachedBySentries = 0;
			means.meanSentriesReachedByMembers = 0;
			means.meanMembersReachedByMembers = 0;
		}

		return lastUpgradeTime;
	}
	else if (action == constants.QUALITY_CACHE_ACTION.GET_SENTRIES_COUNT) {
	  return sentriesCount;
	}
	else if (action == constants.QUALITY_CACHE_ACTION.GET_D_SEN) {
	  return conf.dSen;
	}
}
