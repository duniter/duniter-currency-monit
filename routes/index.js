const fs = require('fs')
const express = require('express')

var app = express.Router()

// Récupérer le fichier de langue
function getLANG( file )
{
  var words
  /*
  Içi fs.readFileSync est synchrone et renvoie directement une chaine. On peut donc enchainer 
  une méthode de chaine comme `split` qui découpe et renvoi un tableau, donc on peut ensuite enchainer 
  une méthode de tableau `reduce` etc...
  Et le tout sera assigné à `LANG` dans l'objet qui est passé au template
  */
  return fs.readFileSync( file, 'utf-8' )
            .split('\n')
            .reduce( (L,line)=> (words = line.split(' '),		// Coupe les mots
                      L[words.shift()] = words.join(' '),		// Le 1er mot est la clé
                      L										// L est retourné pour la ligne suivante
            ), {} )// objet de départ de reduce qui sera `L` dans la fonction fléche
}

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
app.get('/', (req, res)=> res.render('home.html') )

/***************************************
* About Page
***************************************/
app.get('/about', (req, res)=> res.render('about.html') )

/***************************************
* Lister les futurs membres
***************************************/
app.get('/willMembers', 
  require('./willMembers.js'), // the route controler
  (req, res)=> // Send html page
      res.status(200) // 200 n'est pas obligatoire, si on renvoie une réponse
         .render('willMembers.html', {
            LANG: getLANG(`./lg/willMembers_${req.query.lg||'fr'}.txt`)
         })
)

/***************************************
* Lister les membres
***************************************/
app.get('/members', require('./members.js'),
  (req, res)=> res.render('members.html', {
                    // LANG: getLANG(`./lg/members_${lg}.txt`)
                  })
)

/***************************************
* Lister les anciens membres
***************************************/
app.get('/wasMembers', require('./wasMembers.js'), (req, res)=> res.render('wasMembers.html') )

/***************************************
* Lister les block en graph
***************************************/
app.get('/blockCount', require('./blockCount.js'), (req, res)=> res.render('blockCount.html') )

/***************************************
* Évolution de la masse monétaire totale
***************************************/
app.get('/monetaryMass', require('./monetaryMass.js'), (req, res)=> res.render('Chart.html') )

/***************************************
* Évolution du nombre de membres
***************************************/
app.get('/membersCount', require('./membersCount.js'), (req, res)=> res.render('Chart.html') )

module.exports = app