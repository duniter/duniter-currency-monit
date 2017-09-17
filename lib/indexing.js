const os = require('os');
const fs = require('fs')

module.exports = function timestampToDatetime(server, conf, program, params) {
    // Get monitDatasPath
    const mdb = program.mdb || "duniter_default";
    const monitDatasPath = os.homedir() + "/.config/duniter/" + mdb + "/currency-monit/";

    console.log('indexing...');
    console.log('monitDatasPath=%s', monitDatasPath);

    try {
        let files = fs.readdirSync(monitDatasPath);
        // chunk_0-250.json
        for (file of files)
        {
            console.log('%s', file);
        }
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('directory "currency-monit" doesn\'t exist');
        }
    }

    console.log('ok');
}
