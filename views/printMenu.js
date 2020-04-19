const constants = require(__dirname + '/../lib/constants2').MonitConstants

module.exports = function printMenu(lang, help, location) {
  let htmlMenu = '<ul class="menu">';//'<table align="center" width="100%"><tr>';

  htmlMenu += `<li class="menu"><a class="${(location=="WILL_MEMBERS") ? 'active':'menu'}" href="willMembers?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["WILL_MEMBERS"]}</a></li>`;
  htmlMenu += `<li class="menu"><a class="${(location=="MEMBERS") ? 'active':'menu'}" href="members?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["MEMBERS"]}</a></li>`;
  htmlMenu += `<li class="menu"><a class="${(location=="MEMBERS_COUNT") ? 'active':'menu'}" href="membersCount?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["MEMBERS_COUNT"]}</a></li>`;
  htmlMenu += `<li class="menu"><a class="${(location=="WOTEX") ? 'active':'menu'}" href="wotex?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["WOTEX"]}</a></li>`;
  htmlMenu += `<li class="menu"><a class="${(location=="GAUSSIAN_WOT_QUALITY") ? 'active':'menu'}" href="gaussianWotQuality?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["GAUSSIAN_WOT_QUALITY"]}</a></li>`;
  htmlMenu += `<li class="menu"><a class="${(location=="BLOCK_COUNT") ? 'active':'menu'}" href="blockCount?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["BLOCK_COUNT"]}</a></li>`;
  htmlMenu += `<li class="menu"><a class="${(location=="MONETARY_MASS") ? 'active':'menu'}" href="monetaryMass?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["MONETARY_MASS"]}</a></li>`;
  htmlMenu += `<li class="menu"><a class="${(location=="ABOUT") ? 'active':'menu'}" href="about?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["ABOUT"]}</a></li>`;
  htmlMenu += `<li class="menu" style="float:right"><form action="" method="GET"><a class="menu"><select name="lg" onchange="this.form.submit()">`;
	htmlMenu += `<option name="lg" value="fr" ${lang['LG'] == 'fr' ? 'selected' : ''}>FR`;
	htmlMenu += `<option name="lg" value="en" ${lang['LG'] == 'en' ? 'selected' : ''}>EN`;
	htmlMenu += '</select></a></li></ul><br>';//</td></tr></table><hr>';
        
    return htmlMenu;
}
