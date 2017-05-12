const fs = require('fs')
const express = require('express')
const getLang = require('../lib/getLang')

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
            MENU_LANG: getLang(`./lg/menu_${req.query.lg||'fr'}.txt`)
         })
 )

/***************************************
* About Page
***************************************/
app.get('/about', (req, res)=> res.render('about.html', {
            MENU_LANG: getLang(`./lg/menu_${req.query.lg||'fr'}.txt`)
         })
 )

/***************************************
* Lister les futurs membres
***************************************/
app.get('/willMembers', 
  require('./willMembers.js'), // the route controler
  (req, res)=> // Send html page
      res.status(200) // 200 n'est pas obligatoire, si on renvoie une réponse
         .render('willMembers.html', {
	    MENU_LANG: getLang(`./lg/menu_${req.query.lg||'fr'}.txt`),
            LANG: getLang(`./lg/willMembers_${req.query.lg||'fr'}.txt`)
         })
)

/***************************************
* Lister les membres
***************************************/
app.get('/members', require('./members.js'),
  (req, res)=> res.render('members.html', {
		    MENU_LANG: getLang(`./lg/menu_${req.query.lg||'fr'}.txt`),
                    LANG: getLang(`./lg/members_${req.query.lg||'fr'}.txt`)
                  })
)

/***************************************
* Lister les anciens membres
***************************************/
/*app.get('/wasMembers', require('./wasMembers.js'), (req, res)=> res.render('wasMembers.html', {
            MENU_LANG: getLang(`./lg/menu_${req.query.lg||'fr'}.txt`),
            LANG: getLang(`./lg/wasMembers_${lg}.txt`)
         })
 )*/

/***************************************
* Évolution du nombre de membres
***************************************/
app.get('/membersCount', require('./membersCount.js'), (req, res)=> res.render('Chart.html', {
            MENU_LANG: getLang(`./lg/menu_${req.query.lg||'fr'}.txt`),
            LANG: getLang(`./lg/membersCount_${req.query.lg||'fr'}.txt`)
         })
 )

/***************************************
* Lister les block en graph
***************************************/
app.get('/blockCount', require('./blockCount.js'), (req, res)=> res.render('Chart.html', {
            MENU_LANG: getLang(`./lg/menu_${req.query.lg||'fr'}.txt`),
            LANG: getLang(`./lg/blockCount_${req.query.lg||'fr'}.txt`)
         })
 )

/***************************************
* Évolution de la masse monétaire totale
***************************************/
app.get('/monetaryMass', require('./monetaryMass.js'), (req, res)=> res.render('Chart.html', {
            MENU_LANG: getLang(`./lg/menu_${req.query.lg||'fr'}.txt`),
            LANG: getLang(`./lg/monetaryMass_${req.query.lg||'fr'}.txt`)
         })
 )


/***************************************
* Évolution de la masse monétaire totale
***************************************/
app.get('/pubkeyBalance', require('./pubkeyBalance.js'), (req, res)=> res.render('Chart.html', {
            MENU_LANG: getLang(`./lg/menu_${req.query.lg||'fr'}.txt`),
            LANG: getLang(`./lg/pubkeyBalance_${req.query.lg||'fr'}.txt`)
         })
 )


module.exports = app
