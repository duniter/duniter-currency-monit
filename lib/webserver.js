"use strict";

const fs = require('fs');
const Q = require('q');
const _ = require('underscore');
const co = require('co');
const http = require('http');
const morgan = require('morgan');
const express = require('express');
const bodyParser = require('body-parser');

const fsreadline = require('./fs-readline.js');
const tpl = require('./tplit.js');

function timestampToDatetime(timestamp) {
  // Convertir le timestamp en datetime
  let tmptimestampExpireCertif = new Date(timestamp*1000);//tmpQueryGetTimeWrittenCert[0].medianTime)*1000);
  let tmptimestampExpireCertifDay = tmptimestampExpireCertif.getDate();
  if (tmptimestampExpireCertifDay < 10 ) { tmptimestampExpireCertifDay = "0"+tmptimestampExpireCertifDay; }
  let tmptimestampExpireCertifMonth = tmptimestampExpireCertif.getMonth()+1;
  if (tmptimestampExpireCertifMonth < 10 ) { tmptimestampExpireCertifMonth = "0"+tmptimestampExpireCertifMonth; }
  
  // Formater les heures et minutes
  let tmptimestampExpireCertifhours = tmptimestampExpireCertif.getHours();
  if (tmptimestampExpireCertifhours < 10 ) { tmptimestampExpireCertifhours = "0"+tmptimestampExpireCertifhours; }
  let tmptimestampExpireCertifMinutes = tmptimestampExpireCertif.getMinutes();
  if (tmptimestampExpireCertifMinutes < 10 ) { tmptimestampExpireCertifMinutes = "0"+tmptimestampExpireCertifMinutes; }
  //let tmptimestampExpireCertifSeconds = tmptimestampExpireCertif.getSeconds();
  //if (tmptimestampExpireCertifSeconds < 10 ) { tmptimestampExpireCertifSeconds = "0"+tmptimestampExpireCertifSeconds; }

  var stringDateTime = tmptimestampExpireCertifDay+"/"+tmptimestampExpireCertifMonth+"/"+(tmptimestampExpireCertif.getFullYear()).toString().substring(2, 4)+" "
        +tmptimestampExpireCertifhours+":"+tmptimestampExpireCertifMinutes;//+":"+tmptimestampExpireCertifSeconds;
        
  return stringDateTime;
}

module.exports = (host, port, duniterServer, sigValidity, msValidity, sigWindow, idtyWindow) => {

  var app = express();

  app.use(morgan('\x1b[90m:remote-addr :remote-user [:date[clf]] :method :url HTTP/:http-version :status :res[content-length] - :response-time ms\x1b[0m', {
    stream: {
      write: function(message){
        message && console.log(message.replace(/\n$/,''));
      }
    }
  }));
  app.use(bodyParser.urlencoded({ extended: true }));
  
  app.engine('html', tpl )
  app.set('views', './views') // specify the views directory
  app.set('view engine', 'html') // register the template engine

  /****************************************
  * Lister les futurs membres
  ***************************************/
  
  app.get('/willMembers', (req, res) => co(function *() {
    
    try {
      // get blockchain timestamp
      let resultQueryCurrentBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block ORDER BY `medianTime` DESC LIMIT 1 ');
      const currentBlockchainTimestamp = resultQueryCurrentBlock[0].medianTime;
      
      // Initaliser les variables
      var contenu = "";
      var identitiesList = [];
      var idtysPendingCertifsList = [ [ [] ] ];
      
      /*
      En js on peut faire des opération Boolean au milieux du code, des assignations, ...
      Ce qui permet des quelques raccourcis intéressants:
      
      var ok = true
      ;
      ok && foo()
      
      la function foo sera executée si ok est vrai, ça équivaut à noter:
      if( ok )
      {
      		foo()
      }
      
      De la même façon on peut utiliser && (et), || (ou), ! (non) ou encore !! (oui, non(non) en fait )
      
      var aze = 42, foo = "coucou", boo = false
      ;
      foo == 'coucou' && aze < 100 
      		&& method()
      || !boo 
      		&& otherMethod()
      
      Equivaut à :
      
      if( foo == 'coucou' && aze < 100 )
      {
      		method()
      else if( !boo )
      {
      		otherMethod()
      }
      
      Bon, le plus intérresssant est lors d'une assignation, on peux donner une valeure par défaut
      avec cette syntaxe:
      
      var toto = other || 'des faux'
      
      Içi lorsque la tête de lecture de l'interpreteur js arrive au niveau du égal (=),
      si `other` exist et ne contient pas une valeur falsy (false, "", 0, [], undefined, null) 
      alors c'est truthy (comme disent les EN ^^) donc pris pour valeur à assigner.
      Alors que si other est falsy, le OU entre en jeu et la tête de lecture continue 
      et prends donc la chaine pour valeur à assigner.
      
      Tout test même compliqué peut s'écrire et le résultat sera assigné:
      
      var toto = foo == 'coucou' && aze < 100 
					&& method()
				|| !boo 
					&& otherMethod()
		(En supposant que les methodes renvoie des valeures)
      */
      
      // Récupéré les paramètres
      var days = req.query.d || 65 // Valeur par défaut
      var order = req.query.d && req.query.order || 'asc' // Valeur par défaut
      var sort_by = req.query.sort_by || "creationIdty"; // Valeur par défaut
      var hideIdtyWithZeroCert = req.query.hideIdtyWithZeroCert || "no"; // Valeur par défaut
      var sortSig = req.query.sortSig || "Creation"; // Valeur par défaut
      var lg = req.query.lg || "fr"; // Valeur par défaut
      var format = req.query.format || 'HTML'
      
      console.log(req.query);
      
      // Récupérer la liste des identités en piscine
      const resultQueryIdtys = yield duniterServer.dal.peerDAL.query('SELECT `buid`,`pubkey`,`uid`,`hash`,`expires_on` FROM identities_pending WHERE `member`=0');
      
      // Récupérer pour chaque identité, l'ensemble des certifications qu'elle à reçue.
      var nbMaxCertifs = 0;
      for (let i=0;i<resultQueryIdtys.length;i++)
      {
        // Extraire le numéro de bloc d'émission de l'identité
        let idtyBlockStamp = resultQueryIdtys[i].buid.split("-");
        let idtyBlockNumber = idtyBlockStamp[0];
        
        // récupérer le medianTime du bloc d'émission de l'identité
        let resultQueryTimeCreateIdty = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block WHERE `number`=\''+idtyBlockNumber+'\' LIMIT 1');
        
        // récupérer l'ensemble des certifications en attente destinées à l'identité courante
        let tmpQueryPendingCertifsList = yield duniterServer.dal.peerDAL.query(
          'SELECT `from`,`block_number`,`expires_on` FROM certifications_pending WHERE `to`=\''+resultQueryIdtys[i].pubkey+'\' AND `target`=\''+resultQueryIdtys[i].hash+'\' ORDER BY `expires_on` DESC');
        
        // Calculer le nombre de certifications en attentes destinées au membre courant
        let nbPendingCertifs = tmpQueryPendingCertifsList.length;
        let nbValidPendingCertifs = 0;
          
        // Récupérer les uid des émetteurs des certifications reçus par l'utilisateur
        // Et stocker les uid et dates d'expiration dans un tableau
        idtysPendingCertifsList[i] = new Array();
        for (var j=0;j<nbPendingCertifs;j++)
        {
          let tmpQueryGetUidIssuerPendingCert = yield duniterServer.dal.peerDAL.query('SELECT `uid` FROM i_index WHERE `pub`=\''+tmpQueryPendingCertifsList[j].from+'\' LIMIT 1');
          // Vérifier que l'émetteur de la certification correspond à une identité inscrite en blockchain
          if ( tmpQueryGetUidIssuerPendingCert.length > 0 )
          {
            // récupérer le timestamp d'enchainement de la dernière certification écrite par l'émetteur
            let tmpQueryLastIssuerCert = yield duniterServer.dal.peerDAL.query('SELECT `chainable_on` FROM c_index WHERE `issuer`=\''+tmpQueryPendingCertifsList[j].from+'\' ORDER BY `chainable_on` DESC LIMIT 1');
            let certTimestampWritable = 0;
            if ( typeof(tmpQueryLastIssuerCert[0]) != 'undefined' && typeof(tmpQueryLastIssuerCert[0].chainable_on) != 'undefined' )
            { certTimestampWritable = tmpQueryLastIssuerCert[0].chainable_on; }
            
            // Vérifier que l'identité courant n'a pas déjà reçu d'autre(s) certification(s) de la part du même membre
            let doubloonPendingCertif = false;
            for (const idtyPendingCertifsList of idtysPendingCertifsList[i])
            {
              if (idtyPendingCertifsList.from == tmpQueryGetUidIssuerPendingCert[0].uid)
              {
                doubloonPendingCertif = true;
              }
            }
            if (!doubloonPendingCertif)
            {
              // Stoker la liste des certifications en piscine qui n'ont pas encore expirées
              if (tmpQueryPendingCertifsList[j].expires_on > currentBlockchainTimestamp)
              {
                    idtysPendingCertifsList[i].push({
                      from: tmpQueryGetUidIssuerPendingCert[0].uid,
                      blockNumber: tmpQueryPendingCertifsList[j].block_number,
                      timestampExpire: tmpQueryPendingCertifsList[j].expires_on,
                      timestampWritable: certTimestampWritable
                    });
                    nbValidPendingCertifs++;
              }
            }
          }
        }

        // Stocker les informations de l'identité
        identitiesList.push({
          BlockNumber: idtyBlockNumber,
          creationTimestamp: resultQueryTimeCreateIdty[0].medianTime,
          pubkey: resultQueryIdtys[i].pubkey,
          uid: resultQueryIdtys[i].uid,
          hash: resultQueryIdtys[i].hash,
          expires_on: resultQueryIdtys[i].expires_on
        });
        
        // Calculer le nombre maximal de certifications reçus par l'identité courante
        if ( nbValidPendingCertifs > nbMaxCertifs) { nbMaxCertifs = nbValidPendingCertifs; }
      }
      
      // Si demandé, retrier les, certifications par date de disponibilité
      if (sortSig == "Availability")
      {
        var idtysPendingCertifsListSort = [ [] ];
        for (var i=0;i<idtysPendingCertifsList.length;i++)
        {
          idtysPendingCertifsListSort[i] = Array();
          let min;
          let idMin =0;
          let tmpExcluded = Array();
          for (let j=0;j<idtysPendingCertifsList[i].length;j++) { tmpExcluded[j] = false; }
          for (let j=0;j<idtysPendingCertifsList[i].length;j++)
          {
            min = currentBlockchainTimestamp+sigValidity; // begin to min = max
            
            // search idMin (id of certif with min timestampWritable)
            for (let k=0;k<idtysPendingCertifsList[i].length;k++)
            {
              if (idtysPendingCertifsList[i][k].timestampWritable < min && !tmpExcluded[k])
              {
                min = idtysPendingCertifsList[i][k].timestampWritable;
                idMin = k;
              }
            }
          
            // Push min value on sort table
            idtysPendingCertifsListSort[i].push({
              from: idtysPendingCertifsList[i][idMin].from,
              blockNumber: idtysPendingCertifsList[i][idMin].blockNumber,
              timestampExpire: idtysPendingCertifsList[i][idMin].timestampExpire,
              timestampWritable: idtysPendingCertifsList[i][idMin].timestampWritable
            });
        
            // Exclure la valeur min avant de poursuivre le tri
            tmpExcluded[idMin] = true;
          }
        }
        idtysPendingCertifsList = idtysPendingCertifsListSort;
      }
      
      // Initialiser le tableau idtysListOrdered
      var idtysListOrdered = [ [] ];

      // Calculer le timestamp limite à prendre en compte
      var limitTimestamp = currentBlockchainTimestamp + (days*86400);
        
      // Récupérer la valeur du critère de tri pour chaque identité
      var tabSort = [];
      if (sort_by == "creationIdty")
      { 
        for (const idty of identitiesList)
        { tabSort.push(idty.expires_on); }
      }
      else if (sort_by == "sigCount")
      { 
        for (const idtyPendingCertifsList of idtysPendingCertifsList)
        {
          tabSort.push(idtyPendingCertifsList.length);
        }
      }
      else { contenu += "<p>ERREUR : param <i>sort_by</i> invalid !</p>"; }
      
      // Trier les identités par ordre decroissant du critère sort_by
      for (var i=0;i<identitiesList.length;i++)
      {
        let max = -1;
        let idMax =0;
        for (var j=0;j<identitiesList.length;j++) {
          if (tabSort[j] > max)
          {
            max = tabSort[j];
            idMax = j;
          }
        }
        
        // Push max value on sort table, only if respect days limit
        if (limitTimestamp > identitiesList[idMax].expires_on)
        {
          // Vérifier que cette identité n'a pas déjà été prise en compte (empecher les doublons)
          let doubloon = false;
          for (const idty of idtysListOrdered)
          {
            if (identitiesList[idMax].uid == idty.uid && identitiesList[idMax].BlockNumber == idty.BlockNumber)
            { doubloon = true; }
          }
          
          // Push max value on sort table
          if (!doubloon)
          {
            idtysListOrdered.push({
            uid: identitiesList[idMax].uid,
            creationTimestamp: identitiesList[idMax].creationTimestamp,
            pubkey: identitiesList[idMax].pubkey,
            BlockNumber: identitiesList[idMax].BlockNumber,
            expires_on: identitiesList[idMax].expires_on,
            pendingCertifications: idtysPendingCertifsList[idMax]
            });
          }
        }
        // Exclure la valeur max avant de poursuivre le tri
        tabSort[idMax] = -1;
      }
      
      // Si ordre croissant demandé, inverser le tableau
      if (order == 'asc')
      {
        var idtysListOrdered2 = [ [] ];
        let tmpIdtysListOrderedLength = idtysListOrdered.length;
        for (let i=0;i<tmpIdtysListOrderedLength;i++)
        {
          idtysListOrdered2[i] = idtysListOrdered[tmpIdtysListOrderedLength-i-1];
        }
        idtysListOrdered = idtysListOrdered2;
      }
      
      // Si le client demande la réponse au format JSON =, le faire
      if (format == 'JSON')
      {
        // Send JSON reponse
        res.status(200).jsonp( idtysListOrdered )
      }
      // Sinon, printer le tableau html
      else
      {
        /*
        Avec les dernières version de nodejs et ecmascript 6 et 7 il existe des nouvelles syntaxes
        très pratiques, comme:
        
        1) Les string interprétés, comme en PHP les doubles quotes " on peut inserer des variables,
        c'est multiligne, et plus besoin d'échapper les quote " et ' vu qu'içi c'est encore une 3e quote,
        en js c'est les backtick ` (alt-gr 7) comme les champs dans le SQL :
        
        var who = 'doctor',
        	toto = `Hello ${who} !!` // "Hello doctor !!"
        
        Entre le ${ et le } c'est du js normal interpreté:
        
        var html = `<div>
        	<span class="greetings">${toto}</span>
        	${ aze < 100 ? "chaine si vrai" : "chaine si faux" }
        	
        	${ maFonctionQuiRetourneUneChaine(avec, des, prams) }
    	</div>`
    	
    	2) Les fonctions flèches:
    	
    	var toto = arg => arg.value
    	
    	Equivaut à :
    	
    	function toto( arg )
    	{
    		return arg.value
    	}
    	
    	Ou 
    	
    	var toto = (plusieur,arg) => { plusieur(); instructions(); return arg.value }
    	
    	Avec les accolades {} il faut utiliser return pour renvoyer.
    	
    	Très pratiques dans les methodes d' Array qui prennent une fonction en argument,
    	comme filter, map, reduce ou encore sort:
    	
    	var arr = [0,1,2,3,4,5,6,7,8,9]
    	
    	arr.filter( item => item > 5 )					// [6,7,8,9]
    		.map( item => `<span>${item}</span>` )		// ["<span>6</span>", "...", ... ]
    		.join('')									// "<span>6</span><span>7</span><span..."
    	
    	Et si tout ceci se retrouve en valeur dans une string intéerprétée:
    	
    	var html = `<div>
        	<span class="greetings">${toto}</span>
        	${ aze < 100 ? "chaine si vrai" : "chaine si faux" }
        	
        	${ arr.filter( item => item > 5 )
    			.map( item => `<span>${item}</span>` )
    			.join('')
        	}
    	</div>`
    	
    	3) Les raccourci d'objet json:
    	
    	var opt = {
    		toto, 			// équivaut à toto: toto, donc assigne la variable à au même nom de clé
    		method() {} 	// équivaut à method: function () {}
    		get prop(){}	// getter
    		set prop(v){}	// setter
    	}
    	
    	4) La destructuration d'Array ou d'objet:
    	
    	var [ toto, titi ] = monArray
    	
    	toto = monArray[0]
    	titi = monArray[1]
    	
    	var { toto: aze, titi } = obj
    	
    	toto = obj.aze
    	titi = obj.titi
    	
    	Bref! :)
        */
        
        
        // Récupérer le fichier de langue
        // let LANG = tabTxt = 
        // fs.readFileSync(`./lg/willMembers_${lg}.txt`,'utf-8')
        //   .split('\n')
        //   .reduce( (L,line)=> {
        //     let words = line.split(' ')
        //     L[words.shift()] = words.join(' ')
        //     return L
        //   }, {})
        
        /*
        Içi fs.readFileSync est synchrone et renvoie directement une chaine. On peut donc enchainer 
        une méthode de chaine comme `split` qui découpe et renvoi un tableau, donc on peut ensuite enchainer 
        une méthode de tableau `reduce` etc...
        Et le tout assigné à `LANG` dans l'objet qui est passé au template willMembers
        */
        var words
        
        // Send html page
        res.status(200) // 200 n'est pas obligatoire, si on renvoie une réponse
           .render('willMembers', {
              
              // Récupérer le fichier de langue
              // Note sécu: j'ai testé d'injecter des chose dans lg dans la requettte GET 
              // afin d'essayer de charger un autre fichier, système par exemple.
              // Tant qu'il n'existe pas de dossier "willMembers_" tout court on peut pas 
              // remonter les dossiers:
              // ex: GET willMenmbers?lg=/../../../system/fichierTexte 		//urlencodé
              //	./lg/willMembers_/../../../system/fichierTexte.txt
              LANG: fs.readFileSync(`./lg/willMembers_${lg}.txt`,'utf-8')
                      .split('\n')
                      .reduce( (L,line)=> (words = line.split(' '),		// Coupe les mots
                                L[words.shift()] = words.join(' '),		// Le 1er mot est la clé
                                L										// L est retourné pour la ligne suivante
                      ), {id:lg}),// objet de départ de reduce qui sera `L` dans la fonction fléche
              
              // Les varibles à passer au template
              days, sort_by, order, sortSig,
              hideIdtyWithZeroCert,
              
              currentBlockchainTimestamp,
              limitTimestamp,
              sigWindow,
              idtyWindow,
              nbMaxCertifs,
              
              idtysListOrdered,
              idtysListFiltered: idtysListOrdered.filter( idty=> 
                    idty.expires_on < limitTimestamp
                    && idty.expires_on > currentBlockchainTimestamp
                    && (hideIdtyWithZeroCert != "yes" || idty.pendingCertifications.length > 0)
                  ),
              
              // Template helpers
              
              timestampToDatetime,
              // Calculer la proportion de temps restant avant l'expiration
              color: function( timestamp, idtyWindow, max )
              {
                let proportion = ((timestamp-currentBlockchainTimestamp)*max)/idtyWindow;
                proportion = proportion < 0 ? 0 : proportion > max ? max : proportion 
                let hex = parseInt( proportion ).toString(16)
                return `#${hex}${hex}${hex}`
              }
            })
      }
    } catch (e) {
      // En cas d'exception, afficher le message
      res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
    
  }));
  
  /****************************************
  * Lister les membres
  ***************************************/

  app.get('/members', (req, res) => co(function *() {
    
    try {
      
      // get blockchain timestamp
      let resultQueryCurrentBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block ORDER BY `medianTime` DESC LIMIT 1 ');
      const currentBlockchainTimestamp = resultQueryCurrentBlock[0].medianTime;
      
      // Initaliser les variables
      var contenu = "";
      var membersIdentity = [];
      var membersFirstCertifExpire = [];
      var membersIssuerFirstCertif = [];
      var membersCertifsList = [ [ [] ] ];
      var membersPendingCertifsList = [ [ [] ] ];
      var membershipsTimeList = [];
      var membershipsBlockNumberList = [];
      var membershipsExpireTimeList = [];
      
      // Récupéré les paramètres
      var days = 400;// Valeur par défaut
      if( typeof(req.query.d) == 'undefined' ) {
        days = 400;
      } else {
        days = req.query.d;
      }
      var order = 'asc'; // Valeur par défaut
      if (typeof(req.query.d) != 'undefined' && req.query.order == 'desc') {
        order = 'desc';
      }
      var sort_by="idtyWritten"; // Valeur par défaut
      if (typeof(req.query.sort_by) != 'undefined') {
        sort_by = req.query.sort_by;
      }
      var pendingSigs="no";
      if ( typeof(req.query.pendingSigs) != 'undefined' && req.query.pendingSigs == "yes") {
        pendingSigs = "yes";
      }
      var format = req.query.format || 'HTML'
      console.log(req.query);
      
      // Récupérer la liste des identités ayant actuellement le statut de membre
      const membersList = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`pub`,`member`,`written_on` FROM i_index WHERE `member`=1');
      
      // Récupérer pour chaque identité, le numéro du block d'écriture du dernier membership
      // Ainsi que la première ou dernière certification
      var nbMaxCertifs = 0;
      for (let m=0;m<membersList.length;m++)
      {
        // Récupérer les blockstamp d'écriture et date d'expiration du membership courant du membre m
        let tmpQueryResult = yield duniterServer.dal.peerDAL.query(
            'SELECT `written_on`,`expires_on` FROM m_index WHERE `pub`=\''+membersList[m].pub+'\' ORDER BY `expires_on` DESC LIMIT 1');
          membershipsExpireTimeList.push(tmpQueryResult[0].expires_on);
          
        // Extraire le numéro de bloc du blockstamp d'écriture du membership courant
        let blockstampMembershipWritten = tmpQueryResult[0].written_on.split("-"); // Separate blockNumber and blockHash
        membershipsBlockNumberList.push(blockstampMembershipWritten[0]);
        
        // Extraire le numéro de bloc du blockstamp d'écriture de l'identité du membre
        let blockstampIdtyWritten = membersList[m].written_on.split("-"); // Separate blockNumber and blockHash
        
        // Récupérer le champ medianTime du bloc d'écriture de l'identité du membre
        let resultQueryTimeWrittenIdty = yield duniterServer.dal.peerDAL.query(
            'SELECT `medianTime` FROM block WHERE `number`=\''+blockstampIdtyWritten[0]+'\' LIMIT 1')
        
        // Stocker les informations de l'identité
        membersIdentity.push({
          writtenBloc: blockstampIdtyWritten[0],
          writtenTimestamp: resultQueryTimeWrittenIdty[0].medianTime
          });
        
        // récupérer toutes les certification  reçus par l'utilisateur
        let tmpQueryCertifsList = [];
        if (sort_by == "lastSig")
        {
          tmpQueryCertifsList = yield duniterServer.dal.peerDAL.query(
            'SELECT `issuer`,`written_on`,`expires_on` FROM c_index WHERE `receiver`=\''+membersList[m].pub+'\' ORDER BY `expires_on` DESC');
        }
        else
        {
          tmpQueryCertifsList = yield duniterServer.dal.peerDAL.query(
            'SELECT `issuer`,`written_on`,`expires_on` FROM c_index WHERE `receiver`=\''+membersList[m].pub+'\' ORDER BY `expires_on` ASC');
        }
  
        // Calculer le nombre de certifications reçus par le membre courant
        let nbWrittenCertifs = tmpQueryCertifsList.length;
        
        // Récupérer les uid des émetteurs des certifications reçus par l'utilisateur
        // Et stocker les uid et dates d'expiration dans un tableau
        membersCertifsList[m] = new Array();
        for (var i=0;i<nbWrittenCertifs;i++)
        {
          let tmpQueryGetUidIssuerCert = yield duniterServer.dal.peerDAL.query('SELECT `uid` FROM i_index WHERE `pub`=\''+tmpQueryCertifsList[i].issuer+'\' LIMIT 1');
          let tmpBlockWrittenOn = tmpQueryCertifsList[i].written_on.split("-");
          
          // Stoker la liste des certifications qui n'ont pas encore expirées
          if (tmpQueryCertifsList[i].expires_on > currentBlockchainTimestamp)
          {
            if (i == 0)
            {
          membersIssuerFirstCertif.push(tmpQueryGetUidIssuerCert[0].uid);
          membersFirstCertifExpire.push(tmpQueryCertifsList[0].expires_on);
            }
            membersCertifsList[m].push({
            issuer: tmpQueryGetUidIssuerCert[0].uid,
            writtenBloc: tmpBlockWrittenOn[0],
            timestampExpire: tmpQueryCertifsList[i].expires_on
            });
          }
        }
        
        // SI LES CERTIFICATIONS EN PISCINE SONT DEMANDÉES
        let nbValidPendingCertifs = 0;
        if (pendingSigs == "yes")
        {
          // récupérer toutes les certification en piscine destinées à l'utilisateur
          let tmpQueryPendingCertifsList = [];
          if (sort_by == "lastSig")
          {
            tmpQueryPendingCertifsList = yield duniterServer.dal.peerDAL.query(
          'SELECT `from`,`block_number`,`expires_on` FROM certifications_pending WHERE `to`=\''+membersList[m].pub+'\' ORDER BY `expires_on` DESC');
          }
          else
          {
            tmpQueryPendingCertifsList = yield duniterServer.dal.peerDAL.query(
          'SELECT `from`,`block_number`,`expires_on` FROM certifications_pending WHERE `to`=\''+membersList[m].pub+'\' ORDER BY `expires_on` ASC');
          }
          
          // Calculer le nombre de certifications en attentes destinées au membre courant
          let nbPendingCertifs = tmpQueryPendingCertifsList.length;
          
          // Récupérer les uid des émetteurs des certifications reçus par l'utilisateur
          // Et stocker les uid et dates d'expiration dans un tableau
          membersPendingCertifsList[m] = new Array();
          for (var i=0;i<nbPendingCertifs;i++)
          {
            let tmpQueryGetUidIssuerPendingCert = yield duniterServer.dal.peerDAL.query('SELECT `uid` FROM i_index WHERE `pub`=\''+tmpQueryPendingCertifsList[i].from+'\' LIMIT 1');
            // Vérifier que l'émetteur de la certification correspond à une identié connue
            if ( tmpQueryGetUidIssuerPendingCert.length > 0 )
            {
          // récupérer le timestamp d'écriture de la dernière certification écrite par l'émetteur
          let tmpQueryLastIssuerCert = yield duniterServer.dal.peerDAL.query('SELECT `chainable_on` FROM c_index WHERE `issuer`=\''+tmpQueryPendingCertifsList[i].from+'\' ORDER BY `expires_on` DESC LIMIT 1');
          
          // Stoker la liste des certifications en piscine qui n'ont pas encore expirées
          if (tmpQueryPendingCertifsList[i].expires_on > currentBlockchainTimestamp)
          {
            membersPendingCertifsList[m].push({
                from: tmpQueryGetUidIssuerPendingCert[0].uid,
                blockNumber: tmpQueryPendingCertifsList[i].block_number,
                timestampExpire: tmpQueryPendingCertifsList[i].expires_on,
                timestampWritable: (tmpQueryLastIssuerCert[0].chainable_on)
            });
            nbValidPendingCertifs++;
          }
            }
          }
        }
        
        // Calculer le nombre maximal de certifications reçus par le membre courant
        let nbCertifs = nbWrittenCertifs + nbValidPendingCertifs;
        if ( nbCertifs > nbMaxCertifs) { nbMaxCertifs = nbCertifs; }
      }
      
      // Convertir chaque blockNumber (de membership) en timestamp
      for (const membershipBlockNumber of membershipsBlockNumberList) {
        membershipsTimeList.push(yield duniterServer.dal.peerDAL.query(
          'SELECT `medianTime` FROM block WHERE `number`=\''+membershipBlockNumber+'\' LIMIT 1') );
      }
      
      // Traiter les cas ou expires_on est indéfini
      for (let i=0;i<membershipsExpireTimeList.length;i++) {
        if (membershipsExpireTimeList[i] == null)
        {
          membershipsExpireTimeList[i] = membershipsTimeList[i] + msValidity;
        }
      }
          
      // Initialiser le tableau membersListOrdered
      var membersListOrdered = [ [] ];
      var membersCertifsListSorted = [ [] ];
  
      // Calculer le timestamp limite à prendre en compte
      var limitTimestamp = currentBlockchainTimestamp + (days*86400);
          
      // trier les membres par ordre croissant/decroissant du critère sort_by
      var tabSort = [];
      if (sort_by == "idtyWritten")
      { 
        for (const memberIdentity of membersIdentity)
        { tabSort.push(memberIdentity.writtenTimestamp); }
      }
      else if (sort_by == "expireMembership")
      {
        for (const membershipExpireTimeList of membershipsExpireTimeList)
        { tabSort.push(membershipExpireTimeList); }
      }
      else if (sort_by == "lastRenewal")
      { 
        for (const membershipTimeList of membershipsTimeList)
        { tabSort.push(membershipTimeList[0].medianTime); }
      }
      else if (sort_by == "oldestSig" || sort_by == "lastSig")
      { 
        for (const memberCertifsList of membersFirstCertifExpire)
        { tabSort.push(memberCertifsList); }
      }
      else if (sort_by == "sigCount")
      { 
        for (const memberCertifsList of membersCertifsList)
        {
          tabSort.push(memberCertifsList.length);
        }
      }
      else { contenu += "<p>ERREUR : param <i>sort_by</i> invalid !</p>"; }
      for (var i=0;i<membersList.length;i++)
      {
        var maxTime = 0;
        if (order == 'asc') { maxTime = currentBlockchainTimestamp + (msValidity*2); }
        var idMaxTime =0;
        for (var j=0;j<membersList.length;j++) {
          if ( (order == 'desc' && tabSort[j] > maxTime)
            || (order == 'asc' && tabSort[j] > 0 && tabSort[j] < maxTime) )
          {
            maxTime = tabSort[j];
            idMaxTime = j;
          }
        }
        
        // Push max value on sort table, only if respect days limit
        if (limitTimestamp > membershipsExpireTimeList[idMaxTime])
        {
          // Push max value on sort table
          membersListOrdered.push({
            uid: membersList[idMaxTime].uid,
            pub: membersList[idMaxTime].pub,
            idtyWrittenTimestamp: membersIdentity[idMaxTime].writtenTimestamp,
            idtyWrittenBloc: membersIdentity[idMaxTime].writtenBloc,
            lastRenewalTimestamp: membershipsTimeList[idMaxTime][0].medianTime,
            lastRenewalWrittenBloc: membershipsBlockNumberList[idMaxTime],
            expireMembershipTimestamp: membershipsExpireTimeList[idMaxTime],
            certifications: membersCertifsList[idMaxTime],
            pendingCertifications: membersPendingCertifsList[idMaxTime]
          });
          
          membersCertifsListSorted.push({
          issuer: membersCertifsList[idMaxTime].issuer,
          writtenBloc: membersCertifsList[idMaxTime].writtenBloc,
          timestampExpire: membersCertifsList[idMaxTime].timestampExpire
          });
        }
        // Exclure la valeur max avant de poursuivre le tri
        tabSort[idMaxTime] = -1;
      }
      
      // Si le client demande la réponse au format JSON =, le faire
      if (format == 'JSON')
      {
        // Send JSON reponse
        res.status(200).jsonp( membersListOrdered )
      }
      // Sinon, printer le tableau html
      else
      {
        
        var words
        res.status(200)
           .render('members', {
              
              // Récupérer le fichier de langue
              // LANG: fs.readFileSync(`./lg/members_${lg}.txt`,'utf-8')
              //         .split('\n')
              //         .reduce( (L,line)=> (words = line.split(' '),
              //                   L[words.shift()] = words.join(' '),
              //                   L
              //         ), {id:lg}),
              
              days, sort_by, order,
              pendingSigs,
              
              currentBlockchainTimestamp,
              limitTimestamp,
              sigWindow,
              idtyWindow,
              msValidity,
              sigValidity,
              nbMaxCertifs,
              
              membersListOrdered,
              membersListFiltered: membersListOrdered.filter( member=> 
                    member.expireMembershipTimestamp < limitTimestamp 
                    && member.expireMembershipTimestamp > currentBlockchainTimestamp
                  ),
              
              // Template helpers
              
              timestampToDatetime,
              // Calculer la proportion de temps restant avant l'expiration
              color: function( timestamp, idtyWindow, max )
              {
                let proportion = ((timestamp-currentBlockchainTimestamp)*max)/idtyWindow;
                proportion = proportion < 0 ? 0 : proportion > max ? max : proportion 
                let hex = parseInt( proportion ).toString(16)
                return `#${hex}${hex}${hex}`
              },
              /**
               * background: hsl( ${proportion(item.time,period,1,120)}, 100%, 50%, 1 )
               * background: hsl( 0, 0%, ${proportion(item.time,period,0,200)}, 1 )
               * background: #${proportion()}${proportion()}${proportion()}
               */
              proportion: function( timestamp, maxRange, min, max )
              {
                let proportion = ( (timestamp-currentBlockchainTimestamp) * max ) / maxRange
                proportion = proportion < 0 ? 0 : proportion > max ? max : proportion 
                return proportion
              },
              // color2: function( timestamp, maxRange, max )
              // {
              //   // Calculer la proportion de membership restant (en pour 255ème)
              //   let proportion = ((timestamp-currentBlockchainTimestamp)*max)/maxRange;
              //   proportion = proportion < 0 ? 0 : proportion > max ? max : proportion 
                
              //   // Calculer la couleur à attribuer à cette ligne (dégradé du vert au rouge)
              //   let color="";
              //   let tmpRed = 255-(membershipProportion);
              //   if ( tmpRed < 16 ) { color = "0"; }
              //   color += parseInt(tmpRed).toString(16);
              //   let tmpGreen = (membershipProportion);
              //   if ( tmpGreen < 16 ) { color += "0"; }
              //   color += parseInt(tmpGreen).toString(16);
              //   color += "00";
                
              // }
            })
        
      }
    } catch (e) {
      // En cas d'exception, afficher le message
      res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
    
  }));
  
  /****************************************
  * Lister les anciens membres
  ***************************************/
  
  app.get('/wasMembers', (req, res) => co(function *() {
    try {
      // get blockchain timestamp
      let resultQueryCurrentBlock = yield duniterServer.dal.peerDAL.query('SELECT `medianTime` FROM block ORDER BY `medianTime` DESC LIMIT 1 ');
      const currentBlockchainTimestamp = resultQueryCurrentBlock[0].medianTime;
      
      // Initaliser les variables
      var contenu = "";
      var nbExpirMembers = 0;
      var membersBlockExcluded = [];
      var membershipsTimeList = [];
      var membershipsBlockNumberList = [];
      var membershipsExpireTimeList = [];
      
      // Récupérer les paramètres
      var order = 'asc'; // Valeur par défaut
      if (req.query.order == 'desc') {
        order = 'desc';
      }
      console.log(req.query);
      
      // Récupérer la liste des identités n'étant plus membres
      const membersList = yield duniterServer.dal.peerDAL.query('SELECT `uid`,`pub`,`member`,`written_on` FROM i_index WHERE `member`=0 AND `wasMember`=1');
    
      for (const member of membersList) {
        // Récupérer pour chaque identité, le numéro du block d'écriture de son exclusion
        let tmpArray = member.written_on.split("-");
        membersBlockExcluded.push(tmpArray[0]);
        
        // Récupérer pour chaque identité, le numéro du block d'écriture du dernier membership
        let tmpQueryResult = yield duniterServer.dal.peerDAL.query(
            'SELECT `written_on`,`expires_on` FROM m_index WHERE `pub`=\''+member.pub+'\' ORDER BY `written_on` DESC LIMIT 1');
        membershipsExpireTimeList.push(tmpQueryResult[0].expires_on);
        tmpArray = tmpQueryResult[0].written_on.split("-"); // Separate blockNumber and blockHash
        membershipsBlockNumberList.push(tmpArray[0]);
      }
      // Convertir chaque blockNumber en timestamp
      for (const membershipBlockNumber of membershipsBlockNumberList) {
        membershipsTimeList.push(yield duniterServer.dal.peerDAL.query(
          'SELECT `medianTime` FROM block WHERE `number`=\''+membershipBlockNumber+'\' LIMIT 1') );
      }
      
      // Traiter les cas ou expires_on est indéfini
      for (let i=0;i<membershipsExpireTimeList.length;i++) {
        if (membershipsExpireTimeList[i] == null)
        {
          membershipsExpireTimeList[i] = membershipsTimeList[i] + msValidity;
        }
      }
          
      // Initialiser le tableau membersListOrdered
      var membersListOrdered = [ [] ];
          
      // trier les membres par ordre decroissant de block de sortie (membersBlockExcluded)
      for (var i=0;i<membersList.length;i++) {
        var maxBlock = 0;
        var idMaxBlock =0;
        for (var j=0;j<membersList.length;j++) {
          if ( membersBlockExcluded[j] > maxBlock )
          {
            maxBlock = membershipsExpireTimeList[j];
            idMaxBlock = j;
          }
        }
  
        if (i > 0) {
          membersListOrdered.push([membersList[idMaxBlock].uid,
          membershipsTimeList[idMaxBlock][0].medianTime,
          membersBlockExcluded[idMaxBlock],
          membershipsExpireTimeList[idMaxBlock],
          membersList[idMaxBlock].member]);
        } else {
          membersListOrdered[i][0] =  membersList[idMaxBlock].uid;
          membersListOrdered[i][1] =  membershipsTimeList[idMaxBlock][0].medianTime;
          membersListOrdered[i][2] =  membersBlockExcluded[idMaxBlock];
          membersListOrdered[i][3] =  membershipsExpireTimeList[idMaxBlock];
          membersListOrdered[i][4] = membersList[idMaxBlock].member;
        }
            
        membershipsExpireTimeList[idMaxBlock] = -1;
      }
      
      // On parcour tout les membres pour afficher ceux qui ont expirer
      nbExpirMembers = 0;
      contenu += '<b>Membres dont le statut de membre a déjà expiré :</b><br><table border=1>';
      for (var i=0;i<membersList.length;i++) {
        if (membersListOrdered[i][3] < currentBlockchainTimestamp && membersListOrdered[i][4] == 0) {
          // Printer les nom des colonnes
          if (nbExpirMembers == 0) {
            contenu += "<tr><td align='center'>uid</td><td align='center'> date dernier renouvellement </td><td align='center'>n° bloc sortie</td><td align='center'> date d'expiration </td></tr>";
          }
          // Convertir timestamp en date
          var tmpDateLastRenewal = new Date(membersListOrdered[i][1]*1000);
          var tmpDateExpire = new Date((membersListOrdered[i][3])*1000);
          contenu += "<tr><td align='center'>"+membersListOrdered[i][0]+"</td><td align='center'>"+tmpDateLastRenewal.getDate()+"/"
            +(tmpDateLastRenewal.getMonth()+1)+"/"+tmpDateLastRenewal.getFullYear()+" "
            +tmpDateLastRenewal.getHours()+":"+tmpDateLastRenewal.getMinutes()+":"+tmpDateLastRenewal.getSeconds()
            +"</td><td align='center'>"
            +membersListOrdered[i][2]+"</td><td align='center'>"
            +tmpDateExpire.getDate()+"/"+(tmpDateExpire.getMonth()+1)+"/"+tmpDateExpire.getFullYear()+" "
            +tmpDateExpire.getHours()+":"+tmpDateExpire.getMinutes()+":"+tmpDateExpire.getSeconds()+"</td></tr>";
          nbExpirMembers++;
        }
      }
      contenu += "<tr><td align='center' colspan=4> total : <b>"+nbExpirMembers+"</b> membres.</td><t/tr></table><br><hr>";
  
      // Send html page
      res.status(200).send('<pre>' + (contenu) + '</pre>');
    } catch (e) {
      // En cas d'exception, afficher le message
      res.status(500).send('<pre>' + (e.stack || e.message) + '</pre>');
    }
  }));

  // Lancer le serveur web
  let httpServer = http.createServer(app);
  httpServer.on('error', function(err) {
    httpServer.errorPropagates(err);
  });
  
  return {
    openConnection: () => co(function *() {
      try {
        yield Q.Promise((resolve, reject) => {
          // Weird the need of such a hack to catch an exception...
          httpServer.errorPropagates = function(err) {
            reject(err);
          };

          httpServer.listen(port, host, (err) => {
            if (err) return reject(err);
            resolve(httpServer);
          });
        });
        console.log('Server listening on http://' + host + ':' + port);
      } catch (e) {
        console.warn('Could NOT listen to http://' + host + ':' + port);
        console.warn(e);
      }
    }),
  };
};
