const os = require('os');

module.exports = function timestampToDatetime(server, conf, program, params) {
    // Get monitDatasPath
    const mdb = program.mdb || "duniter_default";
    const monitDatasPath = os.homedir() + "/.config/duniter/" + mdb + "/currency-monit/";

              console.log('sync...');
              console.log('monitDatasPath=%s', monitDatasPath);
              console.log('ok');

}
