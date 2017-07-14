const constants = require(__dirname + '/../lib/constants')

module.exports = function printMenu(lang, help) {
  let htmlMenu = '<table align="center" width="100%"><tr>';

  htmlMenu += `<td align="center"><a href="willMembers?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["WILL_MEMBERS"]}</a></td>`;
  htmlMenu += `<td align="center"><a href="members?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["MEMBERS"]}</a></td>`;
  htmlMenu += `<td align="center"><a href="membersCount?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["MEMBERS_COUNT"]}</a></td>`;
  htmlMenu += `<td align="center"><a href="wotex?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["WOTEX"]}</a></td>`;
  if (constants.USE_WOTB6)
  {
    htmlMenu += `<td align="center"><a href="gaussianWotQuality?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["GAUSSIAN_WOT_QUALITY"]}</a></td>`;
  }
  htmlMenu += `<td align="center"><a href="blockCount?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["BLOCK_COUNT"]}</a></td>`;
  htmlMenu += `<td align="center"><a href="monetaryMass?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["MONETARY_MASS"]}</a></td>`;
  htmlMenu += `<td align="center"><a href="about?lg=${lang['LG']}${(typeof(help) != 'undefined' && help == 'no') ? '&help=no':''}">${lang["ABOUT"]}</a></td>`;
  htmlMenu += `<td align="center"><form action="" method="GET"><select name="lg" onchange="this.form.submit()">`;
	htmlMenu += `<option name="lg" value="fr" ${lang['LG'] == 'fr' ? 'selected' : ''}>FR`;
	htmlMenu += `<option name="lg" value="en" ${lang['LG'] == 'en' ? 'selected' : ''}>EN`;
	htmlMenu += '</select></td></tr></table><hr>';
        
    return htmlMenu;
}
