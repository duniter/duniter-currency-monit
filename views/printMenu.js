const constants = require(__dirname + '/../lib/constants2').MonitConstants;

module.exports = function printMenu(lang, help, location) {

  return `<ul class='menu'><li class='menu'><a class='${(location == 'WILL_MEMBERS') ? 'active' : 'menu'}' href='willMembers?lg=${lang['LG']}${(typeof (help) != 'undefined' && help == 'no') ? '&help=no' : ''}'>${lang['WILL_MEMBERS']}</a></li>\n  <li class='menu'><a class='${(location == 'MEMBERS') ? 'active' : 'menu'}' href='members?lg=${lang['LG']}${(typeof (help) != 'undefined' && help == 'no') ? '&help=no' : ''}'>${lang['MEMBERS']}</a></li>\n  <li class='menu'><a class='${(location == 'MEMBERS_COUNT') ? 'active' : 'menu'}' href='membersCount?lg=${lang['LG']}${(typeof (help) != 'undefined' && help == 'no') ? '&help=no' : ''}'>${lang['MEMBERS_COUNT']}</a></li><li class='menu'><a class='${(location == 'WOTEX') ? 'active' : 'menu'}' href='wotex?lg=${lang['LG']}${(typeof (help) != 'undefined' && help == 'no') ? '&help=no' : ''}'>${lang['WOTEX']}</a></li><li class='menu'><a class='${(location == 'GAUSSIAN_WOT_QUALITY') ? 'active' : 'menu'}' href='gaussianWotQuality?lg=${lang['LG']}${(typeof (help) != 'undefined' && help == 'no') ? '&help=no' : ''}'>${lang['GAUSSIAN_WOT_QUALITY']}</a></li>\n  <li class='menu'><a class='${(location == 'BLOCK_COUNT') ? 'active' : 'menu'}' href='blockCount?lg=${lang['LG']}${(typeof (help) != 'undefined' && help == 'no') ? '&help=no' : ''}'>${lang['BLOCK_COUNT']}</a></li>\n  <li class='menu'><a class='${(location == 'MONETARY_MASS') ? 'active' : 'menu'}' href='monetaryMass?lg=${lang['LG']}${(typeof (help) != 'undefined' && help == 'no') ? '&help=no' : ''}'>${lang['MONETARY_MASS']}</a></li>\n  <li class='menu'><a class='${(location == 'ABOUT') ? 'active' : 'menu'}' href='about?lg=${lang['LG']}${(typeof (help) != 'undefined' && help == 'no') ? '&help=no' : ''}'>${lang['ABOUT']}</a></li>\n  <li class='menu' style='float:right'><form action='' method='GET'><a class='menu'><select class='select' name='lg' onchange='this.form.submit()'>\n  <option name='lg' value='fr' ${lang['LG'] == 'fr' ? 'selected' : ''}>FR\n  <option name='lg' value='en' ${lang['LG'] == 'en' ? 'selected' : ''}>EN\n  </select></a></li></ul><br>`;
};
