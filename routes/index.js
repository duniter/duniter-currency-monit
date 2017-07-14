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
	  MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`)
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
    MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`)
  })
)

/***************************************
* Lister les futurs membres
***************************************/
app.get('/willMembers', // chemin (endpoint)
  require(__dirname + '/willMembers.js'), // controleur (route)
  (req, res)=> res.render('willMembers.html', { // rendu (template)
    printMenu,
	  help: req.query.help,
	  MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`),
    LANG: getLang(`${__dirname}/../lg/willMembers_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`)
  })
)

/***************************************
* Lister les membres
***************************************/
app.get('/members',
  require(__dirname + '/members.js'),
  (req, res)=> res.render('members.html', {
    printMenu,
		help: req.query.help,
		MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`),
    LANG: getLang(`${__dirname}/../lg/members_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`)
  })
)

/***************************************
* Lister les anciens membres
***************************************/
/*app.get('/wasMembers',
  require(__dirname + '/wasMembers.js'),
  (req, res)=> res.render('wasMembers.html', {
    printMenu,
    help: req.query.help,
    MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`),
    LANG: getLang(`${__dirname}/../lg/wasMembers_${lg}.txt`)
  })
)*/

/***************************************
* Évolution du nombre de membres
***************************************/
app.get('/membersCount',
  require(__dirname + '/../lib/updateCache.js'), require(__dirname + '/membersCount.js'),
  (req, res)=> res.render('Chart.html', {
    printMenu,
    pageName: 'MEMBERS_COUNT',
    help: req.query.help,
    MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`),
    LANG: getLang(`${__dirname}/../lg/membersCount_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`)
  })
)

/***************************************
* Wotex
***************************************/
app.get('/wotex',
  require(__dirname + '/wotex.js'),
  (req, res)=> res.render('wotex.html', {
    printMenu,
    help: req.query.help,
    MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`),
    LANG: getLang(`${__dirname}/../lg/wotex_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`)
  })
)

/*******************************************
* Graphe gaussien de la qualité des membres
********************************************/
app.get('/gaussianWotQuality', 
  require(__dirname + '/gaussianWotQuality.js'),
  (req, res)=> res.render('Chart.html', {
    printMenu,
    pageName: 'GAUSSIAN_WOT_QUALITY',
    help: req.query.help,
    MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`),
    LANG: getLang(`${__dirname}/../lg/gaussianWotQuality_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`)
  })
)

/***************************************
* Lister les block en graphe
***************************************/
app.get('/blockCount', 
  require(__dirname + '/blockCount.js'),
  (req, res)=> res.render('Chart.html', {
    printMenu,
    pageName: 'BLOCK_COUNT',
    help: req.query.help,
    MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`),
    LANG: getLang(`${__dirname}/../lg/blockCount_${req.query.lg||constants.DEFAULT_LANGUAGE}.txt`)
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