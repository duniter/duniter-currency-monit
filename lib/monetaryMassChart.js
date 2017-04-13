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
    var unit = 'quantitative';
    if (typeof(req.query.unit) != 'undefined' && req.query.unit == 'relative') { unit = 'relative'; }
    // Mettre en forme les données
    var tabLabels = [];
    var tabMonetaryMass = [];
    var previousMass = 0;
    for (let i=0;i<tabCurrency.length;i++)
    {
        if (unit == 'quantitative')
	{
	  if (parseInt(tabCurrency[i].monetaryMass) > previousMass)
	  {
	    tabLabels.push(tabCurrency[i].dateTime);
	    tabMonetaryMass.push(tabCurrency[i].monetaryMass);
	    previousMass = parseInt(tabCurrency[i].monetaryMass);
	  }
	}
	else if (unit == 'relative')
	{
	  if (parseInt(tabCurrency[i].relativeMonetaryMass) > previousMass)
	  {
	    tabLabels.push(tabCurrency[i].dateTime);
	    tabMonetaryMass.push(tabCurrency[i].relativeMonetaryMass);
	    previousMass = parseInt(tabCurrency[i].relativeMonetaryMass);
	  }
	}
	else { res.status(200).send("<pre>Error : undefined unit</pre>"); }
    }
    
    // Define Chart Data
    var myChartData = {
      labels: tabLabels,
	  datasets: [{
	      label: '#Monetary Mass',
	      data: tabMonetaryMass,
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
            text: unit+' Monetary Mass in the range #'+begin+'-#'+end
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
