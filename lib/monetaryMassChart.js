"use strict";

const Q = require('q');
const _ = require('underscore');
const co = require('co');
const http = require('http');
const morgan = require('morgan');
const express = require('express');
const bodyParser = require('body-parser');

module.exports = (req, res, HTML_HEADERS, htmlMenu, tabCurrency, begin, end) => {
  if (typeof(req.query.format) != 'undefined' && req.query.format == 'JSON')
  {
    // Send JSON response
    var response = JSON.stringify(tabCurrency);
    res.status(200).send(response); 
  }
  else {
    // GET parameters
    var unit = 'quantitative';
    if (typeof(req.query.unit) != 'undefined' && req.query.unit == 'relative') { unit = 'relative'; }
    var massByMembers = 'yes';
    if (typeof(req.query.massByMembers) != 'undefined' && req.query.massByMembers == 'no') { massByMembers = 'no'; }
    
    // Mettre en forme les données
    var tabLabels = [];
    var tabMonetaryMass = [];
    var tabBackgroundColor = [];
    var tabBorderColor = [];
    for (let i=0;i<tabCurrency.length;i++)
    {
        tabBackgroundColor.push('rgba(54, 162, 235, 0.5)');
	tabBorderColor.push('rgba(54, 162, 235, 1)');
        if (unit == 'quantitative')
	{
	    tabLabels.push(tabCurrency[i].dateTime);
	    if (massByMembers == "no")
	    {
	      tabMonetaryMass.push(tabCurrency[i].monetaryMass);
	    }
	    else
	    {
	      tabMonetaryMass.push(tabCurrency[i].monetaryMassPerMembers);
	    }
	}
	else if (unit == 'relative')
	{
	    tabLabels.push(tabCurrency[i].dateTime);
	    if (massByMembers == "no")
	    {
	      tabMonetaryMass.push(tabCurrency[i].relativeMonetaryMass);
	    }
	    else
	    {
	      tabMonetaryMass.push(tabCurrency[i].relativeMonetaryMassPerMembers);
	    }
	}
	else { res.status(200).send("<pre>Error : undefined unit</pre>"); }
    }
    
    // Define label and titleChart
    var label = 'Ğ1';
    if (unit == "relative") { label = "DUğ1"; }
    var titleChart = label+' Monetary Mass '
    if (massByMembers == "yes") { titleChart += "by members "; label += "/member"; }
    titleChart += 'in the range #'+begin+'-#'+end;
    
    // Define Chart Data
    var myChartData = {
      labels: tabLabels,
	  datasets: [{
	      label: '#'+label,
	      data: tabMonetaryMass,
	      backgroundColor: tabBackgroundColor,
	      borderColor: tabBorderColor,
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
            text: titleChart
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
    contenu += '<form action="" method="GET">Begin #<input type="number" name="begin" value="'+begin+'"> - End #<input type="number" name="end" value="'+end+'"> <select name="unit">';
    contenu += '<option name="unit" value ="quantitative">quantitative';
    contenu += '<option name="unit" value ="relative"';
    if (unit == 'relative' ) { contenu += ' selected'; }
    contenu +='>relative';
    contenu += '</select> <select name="massByMembers">';
    contenu += '<option name="massByMembers" value ="yes">mass by members';
    contenu += '<option name="massByMembers" value ="no"';
    if (massByMembers == 'no' ) { contenu += ' selected'; }
    contenu +='>total mass';
    contenu += '</select> ';
    contenu += '<input type="submit" value="submit"></form><br>';
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
