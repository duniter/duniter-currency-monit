(function inject(window) {

  "use strict";

  var openNewTab = window.openNewTab
  var mainWindow = window.mainWindow

  window.uiModules['duniter-currency-monit'] = {
    menuIconClass: 'fa-signal',
    menuLabel: 'Ğune Monit',
    menuOpen: openCurrencyMonitModule
  }

  function openCurrencyMonitModule() {

    var currencyMonitModuleHeight = parseInt(localStorage.getItem('currency_monit_module_height')) || 1000;
    var currencyMonitModuleWidth = parseInt(localStorage.getItem('currency_monit_module_width')) || 1400;

    //openNewTab (window.location.origin + '/rml9-web-module/index.html', {
    openNewTab (('localhost:10500/currency-monit/', {
      position: 'center',
      height: currencyMonitModuleHeight,
      width: currencyMonitModuleWidth,
      show: false
    }, function(win) {
      win.show();
      // Remember the window size
      win.on('closed', function() {
        localStorage.setItem('currency_monit_module_height', win.window.innerHeight - 8); // Seems to always have 8 pixels more
        localStorage.setItem('currency_monit_module_width', win.window.innerWidth - 16); // Seems to always have 16 pixels more
        mainWindow.focus();
      });
    });
  }

})(window);
