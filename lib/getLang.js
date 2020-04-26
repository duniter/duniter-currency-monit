const fs = require('fs');

/**
     * getLANG
     * @param file
     * @returns {Array}
     */
module.exports = function getLang( file ) {
  var words;
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
};
