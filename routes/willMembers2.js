"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const will_members_1 = require("../modules/will-members");
const timestampToDatetime = require(__dirname + '/../lib/timestampToDatetime');
module.exports = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const locals = req.app.locals;
    try {
        // Récupérer les paramètres
        const format = req.query.format || 'HTML';
        const { 
        // Paramètres
        days, order, sort_by, showIdtyWithZeroCert, sortSig, 
        // Résultats
        idtysListOrdered, 
        // Variables
        currentBlockNumber, currentBlockchainTimestamp, currentMembersCount, limitTimestamp, dSen, conf, nbMaxCertifs, countMembersWithSigQtyValidCert, meanSentriesReachedByIdtyPerCert, meanMembersReachedByIdtyPerCert, membersQualityExt, } = yield will_members_1.willMembers(locals.duniterServer, req.query.d, req.query.d && req.query.order, req.query.sort_by, req.query.showIdtyWithZeroCert, req.query.sortSig);
        // Si le client demande la réponse au format JSON, le faire
        if (format == 'JSON') {
            // Send JSON reponse
            res.status(200).jsonp(idtysListOrdered);
        }
        // Sinon, printer le tableau html
        else {
            res.locals = {
                // Les varibles à passer au template
                host: req.headers.host.toString(),
                // get parameters
                days, sort_by, order, sortSig,
                showIdtyWithZeroCert,
                // page data
                currentBlockNumber,
                currentBlockchainTimestamp,
                currentMembersCount,
                limitTimestamp,
                nbMaxCertifs,
                countMembersWithSigQtyValidCert,
                idtysListFiltered: idtysListOrdered.filter(idty => idty.expires_on < limitTimestamp && (showIdtyWithZeroCert == "yes" || idty.pendingCertifications.length > 0)),
                // currency parameters
                dSen,
                sigQty: conf.sigQty,
                sigWindow: conf.sigWindow,
                idtyWindow: conf.idtyWindow,
                xpercent: conf.xpercent,
                // willMembers cache data
                meanSentriesReachedByIdtyPerCert,
                meanMembersReachedByIdtyPerCert,
                membersQualityExt,
                // Template helpers
                timestampToDatetime,
                // Calculer la proportion de temps restant avant l'expiration
                color: function (timestamp, idtyWindow, max) {
                    const MIN = 120;
                    let proportion = (((timestamp - currentBlockchainTimestamp) * (max - MIN)) / idtyWindow) + MIN;
                    proportion = proportion < MIN ? MIN : proportion > max ? max : proportion;
                    const hex = proportion.toString(16);
                    return `#${hex}${hex}${hex}`;
                }
            };
            // Passer la main au template
            next();
        }
    }
    catch (e) {
        // En cas d'exception, afficher le message
        res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
    }
});
//# sourceMappingURL=willMembers2.js.map