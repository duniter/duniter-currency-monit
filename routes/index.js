const fs = require('fs')
const express = require('express')

const constants = require(__dirname + '/../lib/constants')
const getLang = require(__dirname + '/../lib/getLang')
const printMenu = require(__dirname + '/../views/printMenu')

var app = express.Router()

function jsonFormat( req, res, next )
{
  var format = req.query.format || 'HTML'
  if (format == 'JSON' && res.locals.json )
    res.status(200).jsonp( res.locals.json )
  else
    next()
}

/*
Les routes sont en 2 ou 3 parties:

app.VERB( chemin, rendu )
app.VERB( chemin, controleur, rendu )

Par exemple, home et about n'ont pas besoin de controleur
*/

/***************************************
* Home Page
***************************************/
app.get('/', // chemin (endpoint)
  (req, res)=> res.render('about.html', { // rendu (template)
    host: req.headers.host.toString(),
    printMenu,
	  help: req.query.help,
	  MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`),
    LANG: getLang(`${__dirname}/../lg/about_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`)
  })
)

/***************************************
* About Page
***************************************/
app.get('/about', // chemin (endpoint)
  (req, res)=> res.render('about.html', { // rendu (template)
    host: req.headers.host.toString(),
    printMenu,
    help: req.query.help,
    MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`),
    LANG: getLang(`${__dirname}/../lg/about_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`)
  })
)

/***************************************
* Évolution de la masse monétaire totale
***************************************/
app.get('/monetaryMass',
  require(__dirname + '/monetaryMass.js'),
  (req, res)=> res.render('Chart.html', {
    printMenu,
    pageName: 'MONETARY_MASS',
    help: req.query.help,
    MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`),
    LANG: getLang(`${__dirname}/../lg/monetaryMass_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`)
  })
)

module.exports = app