const constants = require(__dirname + '/../lib/constants')

module.exports = function printMenu(lang, help, location) {
  let htmlMenu = '<ul class="menu">';//'<table align="center" width="100%"><tr>';
  htmlMenu += `<li class="menu"><a class="${(location=="MONETARY_MASS") ? 'active':'menu'}" href="monetaryMass?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["MONETARY_MASS"]}</a></li>`;
  htmlMenu += `<li class="menu"><a class="${(location=="ABOUT") ? 'active':'menu'}" href="about?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["ABOUT"]}</a></li>`;
  htmlMenu += `<li class="menu" style="float:right"><form action="" method="GET"><a class="menu"><select name="lg" onchange="this.form.submit()">`;
	htmlMenu += `<option name="lg" value="fr" ${lang['LG'] == 'fr' ? 'selected' : ''}>FR`;
	htmlMenu += `<option name="lg" value="en" ${lang['LG'] == 'en' ? 'selected' : ''}>EN`;
	htmlMenu += '</select></a></li></ul><br>';//</td></tr></table><hr>';
        
    return htmlMenu;
}
