const fs = require('fs')
const express = require('express')
const getLang = require(__dirname + '/../lib/getLang')

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
app.get('/', (req, res)=> res.render('about.html', {
            host: req.headers.host.toString(),
	    help: req.query.help,
	    MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||'fr'}.txt`)
         })
 )

/***************************************
* About Page
***************************************/
app.get('/about', (req, res)=> res.render('about.html', {
	    host: req.headers.host.toString(),
	    help: req.query.help,
            MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||'fr'}.txt`)
         })
 )

/***************************************
* Lister les futurs membres
***************************************/
app.get('/willMembers', 
  require(__dirname + '/willMembers.js'), // the route controler
  (req, res)=> // Send html page
      res.status(200) // 200 n'est pas obligatoire, si on renvoie une réponse
         .render('willMembers.html', {
	    help: req.query.help,
	    MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||'fr'}.txt`),
            LANG: getLang(`${__dirname}/../lg/willMembers_${req.query.lg||'fr'}.txt`)
         })
)

/***************************************
* Lister les membres
***************************************/
app.get('/members', /*require('../lib/updateCache.js'),*/ require(__dirname + '/members.js'),
  (req, res)=> res.render('members.html', {
		    help: req.query.help,
		    MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||'fr'}.txt`),
                    LANG: getLang(`${__dirname}/../lg/members_${req.query.lg||'fr'}.txt`)
                  })
)

/***************************************
* Lister les anciens membres
***************************************/
/*app.get('/wasMembers', require(__dirname + '/wasMembers.js'), (req, res)=> res.render('wasMembers.html', {
	    help: req.query.help,
            MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||'fr'}.txt`),
            LANG: getLang(`${__dirname}/../lg/wasMembers_${lg}.txt`)
         })
 )*/

/***************************************
* Évolution du nombre de membres
***************************************/
/*app.get('/membersCount', require('${__dirname}/../lib/updateCache.js'), require(__dirname + '/membersCount.js'), (req, res)=> res.render('Chart.html', {
	    help: req.query.help,
            MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||'fr'}.txt`),
            LANG: getLang(`${__dirname}/../lg/membersCount_${req.query.lg||'fr'}.txt`)
         })
 )*/

/***************************************
* Lister les block en graph
***************************************/
app.get('/blockCount', /*require('${__dirname}/../lib/updateCache.js'),*/ require(__dirname + '/blockCount.js'), (req, res)=> res.render('Chart.html', {
	    help: req.query.help,
            MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||'fr'}.txt`),
            LANG: getLang(`${__dirname}/../lg/blockCount_${req.query.lg||'fr'}.txt`)
         })
 )

/***************************************
* Évolution de la masse monétaire totale
***************************************/
app.get('/monetaryMass', require(__dirname + '/monetaryMass.js'), (req, res)=> res.render('Chart.html', {
	    help: req.query.help,
            MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||'fr'}.txt`),
            LANG: getLang(`${__dirname}/../lg/monetaryMass_${req.query.lg||'fr'}.txt`)
         })
 )


/***************************************
* Solde d'une clé
***************************************/
/*app.get('/pubkeyBalance', require('${__dirname}/../lib/updateCache.js'), require(__dirname + '/pubkeyBalance.js'), (req, res)=> res.render('Chart.html', {
	    help: req.query.help,
            MENU_LANG: getLang(`${__dirname}/../lg/menu_${req.query.lg||'fr'}.txt`),
            LANG: getLang(`${__dirname}/../lg/pubkeyBalance_${req.query.lg||'fr'}.txt`)
         })
 )*/

module.exports = app