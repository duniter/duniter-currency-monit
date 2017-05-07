"use strict";

const co = require('co')
const timestampToDatetime = require('../lib/timestampToDatetime')
const colorScale = require('../lib/colorScale')

// Garder l'index des blocs en mémoire vive
var blockchain = [];
var hashPreviousCurrentblock = 0;
var previousBlockchainTime= 0;

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer, sigValidity, msValidity, sigWindow, idtyWindow } = req.app.locals
  
  try {
    // get GET parameters
    var begin = req.query.begin >= 0 && req.query.begin || 0; // Default begin Value is zero
    var end = req.query.end >= 0 && req.query.end || -1; // Default Value is -1 (=current block)
    var format = req.query.format || 'HTML';
    var data = req.query.data || 'nbBlocks';
    var perNode = (req.query.perNode == 'yes') ? 'yes':'no';
    var significantPercent = req.query.significantPercent || 3;
    
    // detect fork
    if ( blockchain.length > 0 )
    {
      let newHashPreviousCurrentblock = yield duniterServer.dal.peerDAL.query('SELECT `hash` FROM block WHERE `fork`=0 AND `number` = '+(blockchain.length-1)+' LIMIT 1');
      if ( hashPreviousCurrentblock != newHashPreviousCurrentblock )
      {
	blockchain.splice(0, blockchain.length);
	hashPreviousCurrentblock = 0;
	previousBlockchainTime = 0;
      }
    }
    
    // get medianTime of endBlock 
    var endBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`hash` FROM block WHERE `fork`=0 AND `number` = '+end+' LIMIT 1');
    
    // get new blocks
    var newBlocks = [];
    if (end < 0)
    {
      newBlocks = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` > '+previousBlockchainTime+' ORDER BY `medianTime` ASC');
      blockchain = blockchain.concat(newBlocks);
    }
    else if (end > blockchain.length)
    {
      newBlocks = yield duniterServer.dal.peerDAL.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` <= '+endBlock[0].medianTime+' AND `medianTime` > '+previousBlockchainTime+' ORDER BY `medianTime` ASC');
      
      for (let i=0;i<newBlocks.length;i++)
      {
        blockchain.push(newBlocks[i]);
      }
    }
    
    // stock hashPreviousCurrentblock and previousBlockchainTime
    let tmpCurrentBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime`,`hash` FROM block WHERE `fork`=0 AND `number` = '+(blockchain.length-1)+' LIMIT 1');
    hashPreviousCurrentblock = tmpCurrentBlock[0].hash;
    previousBlockchainTime = tmpCurrentBlock[0].medianTime;
   
    // fix end
    if (end == -1) { end = blockchain.length-1; }
    
    // get idtys list
    var idtys = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`pub`,`written_on` FROM i_index WHERE `wasMember`=1');
    
    // create and initialize tabBlockMembers, tabBlockCountPerNode and tabDataPerNode
    var tabBlockMembers = [ [] ];
    var tabCoreCountPerNode = [ [] ];
    var tabBlockCountPerNode = [ [] ];
    var tabDataPerNode = [ [] ];
    var maxIdNode = 1;
    for (let i=0;i<idtys.length;i++)
    {
      let tmpBecomeMember = idtys[i].written_on.split("-");
      tabBlockMembers.push ({
        uid: idtys[i].uid,
        pubkey: idtys[i].pub,
	becomeMember: (tmpBecomeMember[0] > begin) ? tmpBecomeMember[0]:begin,
	coreCount: 0,
	blockCount: 0, 
        data: 0
      });
      // initialize tabBlockCountPerNode and tabDataPerNode
      if (perNode == 'yes')
      {
	tabCoreCountPerNode.push(new Array());
	tabBlockCountPerNode.push(new Array());
	tabDataPerNode.push(new Array());
      }
    }
    
    // full tabBlockCountPerNode and tabDataPerNode with zero
    if (perNode == 'yes')
    {
      for (let m=0;m<tabBlockMembers.length;m++)
      {
	for (let n=0;n<9;n++)
	{
	  tabCoreCountPerNode[m].push(0);
	  tabBlockCountPerNode[m].push(0);
	  if (data == 'meanNonce') { tabDataPerNode[m].push(0); }
	}
      }
    }
    
    // Calculate the sum of blocks and their nonce and number of core
    for (let b=begin;b<blockchain.length;b++)
    {
      for (let m=0;m<tabBlockMembers.length;m++)
      {
        if (tabBlockMembers[m].pubkey == blockchain[b].issuer)
        {
	  tabBlockMembers[m].blockCount++;
	  let nonce = parseInt((blockchain[b].nonce).toString().substr(3));
	  if (data == 'meanNonce') { tabBlockMembers[m].data += nonce; }
	  
	  let idCore = parseInt((blockchain[b].nonce).toString().substr(1, 2));
	  tabBlockMembers[m].coreCount = (tabBlockMembers[m].coreCount < idCore) ? idCore:tabBlockMembers[m].coreCount;
	  
	  let idNode = parseInt((blockchain[b].nonce).toString().substr(0, 1));
	  if (perNode == 'yes')
	  {
	    maxIdNode = (idNode > maxIdNode) ? idNode:maxIdNode;
	    tabCoreCountPerNode[m][idNode-1] = (tabCoreCountPerNode[m][idNode-1] < idCore) ? idCore:tabCoreCountPerNode[m][idNode-1];
	    tabBlockCountPerNode[m][idNode-1]++;
	    if (data == 'meanNonce') { tabDataPerNode[m][idNode-1] += nonce; }
	  }
        }
      }
    }
    
    // Delete non-significant nodes
    // A node is considered as significant if its blockCount represents more than 3 % of the total member blockCount
    var maxSignificantIdNode = 1;
    if (perNode == 'yes')
    {
      for (let m=0;m<tabBlockMembers.length;m++)
      {
        let significantLimit = parseInt(tabBlockMembers[m].blockCount * significantPercent / 100);
	for (let n=0;n<maxIdNode;n++)
	{
	      if (tabBlockCountPerNode[m][n] <= significantLimit)
	      {
	        tabBlockMembers[m].blockCount -= tabBlockCountPerNode[m][n];
		tabCoreCountPerNode[m][n] = 0;
		tabBlockCountPerNode[m][n] = 0;
		if (data == 'meanNonce')
		{
		  tabBlockMembers[m].data -= tabDataPerNode[m][n];
		  tabDataPerNode[m][n] = 0;
		}
	      }
	      else if (tabBlockCountPerNode[m][n] > 0)
	      {
		maxSignificantIdNode = ((n+1) > maxSignificantIdNode) ? (n+1):maxSignificantIdNode;
	      }
	}
      }
    }
    
    // calculate data (writtenPercent or meanNonce or writtenPercentSinceBecomeMember or  
    for (let m=0;m<tabBlockMembers.length;m++)
    {
      if (data == 'nbBlocks')
      {
	tabBlockMembers[m].data = tabBlockMembers[m].blockCount;
	if (perNode == 'yes') {
	  for (let n=0;n<maxSignificantIdNode;n++) { tabDataPerNode[m].push(tabBlockCountPerNode[m][n]); }
	}
      }
      else if (data == 'writtenPercent')
      {
	tabBlockMembers[m].data = parseFloat( ((tabBlockMembers[m].blockCount * 100) / (blockchain.length-begin)).toFixed(2) );
	if (perNode == 'yes') {
	  for (let n=0;n<maxSignificantIdNode;n++) {
            tabDataPerNode[m].push( parseFloat( ((tabBlockCountPerNode[m][n] * 100) / (blockchain.length-begin)).toFixed(2) ) );
	  }
	}
      }
      else if (data == 'meanNonce' && tabBlockMembers[m].blockCount > 0)    
      {
	tabBlockMembers[m].data = parseInt( (tabBlockMembers[m].data / (tabBlockMembers[m].blockCount)).toFixed(0) );
	if (perNode == 'yes') {
	  for (let n=0;n<maxSignificantIdNode;n++) {
            tabDataPerNode[m][n] = parseInt( (tabDataPerNode[m][n] / (tabBlockCountPerNode[m][n])).toFixed(0) );
	  }
	}
      }
      else if (data == 'writtenPercentSinceBecomeMember')
      {
	let nbBlockwithThisMember = (tabBlockMembers[m].becomeMember > begin) ? (blockchain.length-tabBlockMembers[m].becomeMember) : (blockchain.length-begin);
	tabBlockMembers[m].data = parseFloat( ((tabBlockMembers[m].blockCount * 100) / nbBlockwithThisMember).toFixed(2) );
	if (perNode == 'yes') {
	  for (let n=0;n<maxSignificantIdNode;n++) {
	    tabDataPerNode[m].push( parseFloat( ((tabBlockCountPerNode[m][n] * 100) / nbBlockwithThisMember).toFixed(2) ) );
	  }
	}
      }
    }
    
    // trier le tableau par ordre croissant de data
    var tabBlockMembersSort = [ [] ];
    var tabExcluded = [];
    for (let m=0;m<tabBlockMembers.length;m++)
    {
      let max = -1;
      let idMax = 0;
      for (let m2=0;m2<tabBlockMembers.length;m2++)
      {
        if (tabBlockMembers[m2].data > max)
        {
          let exclude = false;
          for (let e=0;e<tabExcluded.length;e++)
          {
            if (tabExcluded[e] == tabBlockMembers[m2].uid) { exclude = true; }
          }
          if (!exclude)
          {
            max = tabBlockMembers[m2].data;
            idMax = m2;
          }
        }
      }
      tabBlockMembersSort.push({
        uid: tabBlockMembers[idMax].uid,
        pubkey: tabBlockMembers[idMax].pub,
	becomeMember: tabBlockMembers[idMax].becomeMember,
	coreCount: tabBlockMembers[m].coreCount,
	coreCountPerNode: (perNode == 'yes') ? tabCoreCountPerNode[idMax]:null,
	blockCount: tabBlockMembers[idMax].blockCount,
	blockCountPerNode: (perNode == 'yes') ? tabBlockCountPerNode[idMax]:null,
        data: tabBlockMembers[idMax].data,
	dataPerNode: (perNode == 'yes') ? tabDataPerNode[idMax]:null
      });
      tabExcluded.push(tabBlockMembers[idMax].uid);
    }
    
    //define dataLabel
    var dataLabel = '#Written blocks';
    if (data == 'writtenPercent') { dataLabel = "\% blockchain"; }
    else if (data == 'writtenPercentSinceBecomeMember') { dataLabel = "\% blockchain (since become member)"; }
    else if (data == 'meanNonce') { dataLabel = '#Mean nonce'; }
    
    // Si le client demande la réponse au format JSON, le faire
    if (format == 'JSON')
      res.status(200).jsonp( tabBlockMembersSort )
    else
    {
      // Formatting data
      var tabLabels = [];
      var tabDataX = [];
      var tabDataXperNode = [ [] ];
      var tabBackgroundColor = [];
      var tabBorderColor = [];
      var tabHoverBackgroundColor = [];
      var nbMembers = 0;
      for (let n=0;n<maxIdNode;n++) { tabDataXperNode.push(new Array()); }
      for (let m=0;m<tabBlockMembersSort.length;m++)
      {
	if (tabBlockMembersSort[m].data > 0)
	{
	  if (perNode == 'yes')
	  {
	    tabLabels.push(tabBlockMembersSort[m].uid+"(");
	    for (let n=0;n<maxSignificantIdNode;n++)
	    {
	      tabDataXperNode[n].push(tabBlockMembersSort[m].dataPerNode[n]);
	      if (tabBlockMembersSort[m].coreCountPerNode[n] > 0) { tabLabels[tabLabels.length-1] += tabBlockMembersSort[m].coreCountPerNode[n]+"c,"; }
	    }
	    tabLabels[tabLabels.length-1] = tabLabels[tabLabels.length-1].substr(0, tabLabels[tabLabels.length-1].length-1);
	    tabLabels[tabLabels.length-1] += ")";
	  }
	  else
	  {
	    tabLabels.push(tabBlockMembersSort[m].uid/*+"("+tabBlockMembersSort[m].coreCount+"c)"*/);
	    tabDataX.push(tabBlockMembersSort[m].data);
	  }
	  nbMembers++;
	}
      }
      
      var datasets = [ [] ];
      if (perNode == 'yes')
      {
	for (let n=0;n<maxSignificantIdNode;n++)
	{
	  datasets.push({
		label: dataLabel,
		data: tabDataXperNode[n],
		backgroundColor: colorScale(nbMembers, 0.5),
		borderWidth: 0,
		hoverBackgroundColor: colorScale(nbMembers, 0.2)
	      });
	}
      }
      else
      {
	datasets = [{
		label: dataLabel,
		data: tabDataX,
		backgroundColor: colorScale(nbMembers, 0.5),
		borderColor: colorScale(nbMembers, 1),
		borderWidth: 1,
		hoverBackgroundColor: colorScale(nbMembers, 0.2),
		hoverBorderColor: colorScale(nbMembers, 0.2)
	      }];
      }
      
      res.locals = {
         tabBlockMembersSort, 
         begin, 
         end,
	 data,
	 perNode,
	 description: ``,
	 chart: {
	    type: 'bar',
	    data: {
	      labels: tabLabels,
	      datasets: datasets
	    },
	    options: {
	      title: {
		display: true,
		text: nbMembers+' members have written blocks in the range #'+begin+'-#'+end
	      },
	      legend: {
		display: false
	      },
	      scales: {
		yAxes: [{
		  ticks: {
		      beginAtZero: true,
		  }
		}]
	      },
	      categoryPercentage: 1.0,
	      barPercentage: 1.0
	    }
	  },
	  form: `Begin #<input type="number" name="begin" value="${begin}" size="7" style="width:60px;"> - End #<input type="number" name="end" value="${end}" size="7" style="width:60px;">
	    <select name="data">
	      <option name="data" value ="nbBlocks">Number of written Blocks
	      <option name="data" value ="writtenPercent" ${data == 'writtenPercent' ? 'selected' : ''}>Percent of written Blocks
	      <option name="data" value ="writtenPercentSinceBecomeMember" ${data == 'writtenPercentSinceBecomeMember' ? 'selected' : ''}>Percent of written Blocks since become member
	      <option name="data" value ="meanNonce" ${data == 'meanNonce' ? 'selected' : ''}>mean nonce
	    </select>
	    <input type="checkbox" name="perNode" value="yes" ${perNode == 'yes' ? 'checked' : ''}>detail by node - 
	    significant limit <input type="number" name="significantPercent" value="${significantPercent}" size="2" style="width:30px;">% of blocks`
      }
      next()
    }
    
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
  }
})