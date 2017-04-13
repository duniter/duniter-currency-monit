"use strict";

const Q = require('q');
const _ = require('underscore');
const co = require('co');
const http = require('http');
const morgan = require('morgan');
const express = require('express');
const bodyParser = require('body-parser');

module.exports = (req, res, HTML_HEADERS, htmlMenu, tabNbBlockByMemberSort, begin, end) => {
  if (typeof(req.query.format) != 'undefined' && req.query.format == 'JSON')
  {
    // Send JSON response
    var response = JSON.stringify(tabNbBlockByMemberSort);
    res.status(200).send(response); 
  }
  else {
    // Mettre en forme les données
    var tabLabels = [];
    var tabNbBlocks = [];
    var nbBlocks = 0;
    var nbMembers = 0;
    const NB_PARTS = 34;
    for (let i=0;i<NB_PARTS-1;i++)
    {
        if (tabNbBlockByMemberSort[i].nbBlocks > 0)
	{
	  tabLabels.push(tabNbBlockByMemberSort[i].uid);
	  tabNbBlocks.push(tabNbBlockByMemberSort[i].nbBlocks);
	  nbBlocks += tabNbBlockByMemberSort[i].nbBlocks;
	  nbMembers++;
	}
    }
    // Other Part
    if ( ( (end- begin) - nbBlocks) > 0 )
    {
      tabLabels.push("Others");
      tabNbBlocks.push( (end- begin) - nbBlocks);
    }
    
    // Define Chart Data
    var myChartData = {
      labels: tabLabels,
	  datasets: [{
	      label: '#Written blocks',
	      data: tabNbBlocks,
	      backgroundColor: [
		  'rgba(255, 99, 132, 0.3)', // Red
		  'rgba(255, 129, 98, 0.3)', // Red-Orange
		  'rgba(255, 159, 64, 0.3)', // Orange
		  'rgba(255, 182, 75, 0.3)', // Orange-Yellow
		  'rgba(255, 206, 86, 0.3)', // Yellow
		  'rgba(165, 199, 139, 0.3)', // Yellow-Green
		  'rgba(75, 192, 192, 0.3)', // Green
		  'rgba(64, 177, 213, 0.3)', // Green-Blue
		  'rgba(54, 162, 235, 0.3)', // Blue
		  'rgba(103, 132, 245, 0.3)', // Blue-Purple
		  'rgba(153, 102, 255, 0.3)', // Purple
		  'rgba(255, 99, 132, 0.3)', // Red
		  'rgba(255, 129, 98, 0.3)', // Red-Orange
		  'rgba(255, 159, 64, 0.3)', // Orange
		  'rgba(255, 182, 75, 0.3)', // Orange-Yellow
		  'rgba(255, 206, 86, 0.3)', // Yellow
		  'rgba(165, 199, 139, 0.3)', // Yellow-Green
		  'rgba(75, 192, 192, 0.3)', // Green
		  'rgba(64, 177, 213, 0.3)', // Green-Blue
		  'rgba(54, 162, 235, 0.3)', // Blue
		  'rgba(103, 132, 245, 0.3)', // Blue-Purple
		  'rgba(153, 102, 255, 0.3)', // Purple
		  'rgba(255, 99, 132, 0.3)', // Red
		  'rgba(255, 129, 98, 0.3)', // Red-Orange
		  'rgba(255, 159, 64, 0.3)', // Orange
		  'rgba(255, 182, 75, 0.3)', // Orange-Yellow
		  'rgba(255, 206, 86, 0.3)', // Yellow
		  'rgba(165, 199, 139, 0.3)', // Yellow-Green
		  'rgba(75, 192, 192, 0.3)', // Green
		  'rgba(64, 177, 213, 0.3)', // Green-Blue
		  'rgba(54, 162, 235, 0.3)', // Blue
		  'rgba(103, 132, 245, 0.3)', // Blue-Purple
		  'rgba(153, 102, 255, 0.3)', // Purple
		  'rgba(128, 128, 128, 0.3)' // Grey
	      ],
	      borderColor: [
		  'rgba(255, 99, 132, 1)', // Red
		  'rgba(255, 129, 98, 1)', // Red-Orange
		  'rgba(255, 159, 64, 1)', // Orange
		  'rgba(255, 182, 75, 1)', // Orange-Yellow
		  'rgba(255, 206, 86, 1)', // Yellow
		  'rgba(165, 199, 139, 1)', // Yellow-Green
		  'rgba(75, 192, 192, 1)', // Green
		  'rgba(64, 177, 213, 1)', // Green-Blue
		  'rgba(54, 162, 235, 1)', // Blue
		  'rgba(103, 132, 245, 1)', // Blue-Purple
		  'rgba(153, 102, 255, 1)', // Purple
		  'rgba(255, 99, 132, 1)', // Red
		  'rgba(255, 129, 98, 1)', // Red-Orange
		  'rgba(255, 159, 64, 1)', // Orange
		  'rgba(255, 182, 75, 1)', // Orange-Yellow
		  'rgba(255, 206, 86, 1)', // Yellow
		  'rgba(165, 199, 139, 1)', // Yellow-Green
		  'rgba(75, 192, 192, 1)', // Green
		  'rgba(64, 177, 213, 1)', // Green-Blue
		  'rgba(54, 162, 235, 1)', // Blue
		  'rgba(103, 132, 245, 1)', // Blue-Purple
		  'rgba(153, 102, 255, 1)', // Purple
		  'rgba(255, 99, 132, 1)', // Red
		  'rgba(255, 129, 98, 1)', // Red-Orange
		  'rgba(255, 159, 64, 1)', // Orange
		  'rgba(255, 182, 75, 1)', // Orange-Yellow
		  'rgba(255, 206, 86, 1)', // Yellow
		  'rgba(165, 199, 139, 1)', // Yellow-Green
		  'rgba(75, 192, 192, 1)', // Green
		  'rgba(64, 177, 213, 1)', // Green-Blue
		  'rgba(54, 162, 235, 1)', // Blue
		  'rgba(103, 132, 245, 1)', // Blue-Purple
		  'rgba(153, 102, 255, 1)', // Purple
		  'rgba(128, 128, 128, 1)' // Grey
	      ],
	      borderWidth: 1
	  }]
    }
    
    // Define Chart Options
    var myChartOptions = {
	plugins: {
	    afterDraw: function (chart, easing) {
		var self = chart.config;    /* Configuration object containing type, data, options */
		var ctx = chart.chart.ctx;  /* Canvas context used to draw with */
	    }
	},
	title: {
            display: true,
            text: nbMembers+' members have write blocks in the range #'+begin+'-#'+end
        },
	legend: {
            display: false
	},
	scales: {
	      yAxes: [{
		  ticks: {
		      beginAtZero:true
		  }
	      }]
	  }
    }
  
    // creating chartJs Object
    var chartJs = {
      type: 'bar',
      data: myChartData,
      options: myChartOptions
    }
    
    // Write head
    var contenu = HTML_HEADERS+'<script src="https://librelois.fr/js/Chart.min.js"></script></head><body>';
    contenu += htmlMenu;
    contenu += '<form action="" method="GET">Begin #<input type="number" name="begin" value="'+begin+'"> - End #<input type="number" name="end" value="'+end+'"><input type="submit" value="submit"></form><br>';
    contenu += '<canvas id="myChart"></canvas><script>';// style="max-width: 600px; max-height: 600px;"
    
    // Write body
    contenu +='var ctx = document.getElementById("myChart").getContext("2d");\n';
    contenu +='var myNewChart = new Chart(ctx, {{chartData}});';
    
    // Write ChartData
    contenu = contenu.replace('{{chartData}}', JSON.stringify(chartJs));
    
    // Write foot
    contenu += '</script></body></html>';    
    
    // Send HTML response
    res.status(200).send(contenu);
  }
};
