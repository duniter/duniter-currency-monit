"use strict";

const Q = require('q');
const _ = require('underscore');
const co = require('co');
const http = require('http');
const morgan = require('morgan');
const express = require('express');
const bodyParser = require('body-parser');

module.exports = (req, res, htmlMenu, tabCurrency, begin, end) => {
  if (typeof(req.query.format) != 'undefined' && req.query.format == 'JSON')
  {
    // Send JSON response
    var response = JSON.stringify(tabCurrency);
    res.status(200).send(response); 
  }
  else {
    // Formatting data
    var tabLabels = [];
    var tabMembersCount = [];
    for (let i=0;i<tabCurrency.length;i++)
    {
	    tabLabels.push(tabCurrency[i].dateTime);
	    tabMembersCount.push(tabCurrency[i].membersCount);
    }
    
    // Define Chart Data
    var myChartData = {
      labels: tabLabels,
	  datasets: [{
	      label: '#Members Count',
	      data: tabMembersCount,
	      backgroundColor: [
		  'rgba(54, 162, 235, 0.3)' // Blue
	      ],
	      borderColor: [
		  'rgba(54, 162, 235, 1)' // Blue
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
            text: ' Members Count in the range #'+begin+'-#'+end
        },
	legend: {
            display: false
	}
    }
  
    // creating chartJs Object
    var chartJs = {
      type: 'line',
      data: myChartData,
      options: myChartOptions
    }
    
    // Write head
    var contenu = "<!DOCTYPE html>";
    contenu += '<html><head><script src="https://librelois.fr/js/Chart.min.js"></script></head><body>';
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
