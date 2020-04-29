"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
const MonitorExecutionTime_1 = require("./MonitorExecutionTime");
class DataFinder {
    constructor(duniterServer) {
        this.duniterServer = duniterServer;
        this.memCache = {};
    }
    findPendingMembers() {
        return this.query('SELECT `buid`,`pubkey`,`uid`,`hash`,`expires_on`,`revocation_sig` FROM identities_pending WHERE `member`=0');
    }
    findPendingCertsToTarget(toPubkey, hash) {
        return this.getFromCacheOrDB('findPendingCertsToTarget', [toPubkey, hash].join('-'), () => this.query('SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\'' + toPubkey + '\' AND `target`=\'' + hash + '\' ORDER BY `expires_on` DESC'));
    }
    getWotexInfos(uid) {
        return this.duniterServer.dal.idtyDAL.query('' +
            'SELECT hash, uid, pub, wotb_id FROM i_index WHERE uid = ? ' +
            'UNION ALL ' + 'SELECT hash, uid, pubkey as pub, (SELECT NULL) AS wotb_id FROM idty WHERE uid = ?', [uid, uid]);
    }
    getBlock(block_number) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.getFromCacheOrDB('getBlock', String(block_number), () => this.duniterServer.dal.getBlock(block_number))) || undefined;
        });
    }
    getUidOfPub(pub) {
        return this.getFromCacheOrDB('getUidOfPub', pub, () => this.query('SELECT `uid` FROM i_index WHERE `pub`=\'' + pub + '\' LIMIT 1'));
    }
    getWotbIdByIssuerPubkey(issuerPubkey) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getFromCacheOrDB('getWotbIdByIssuerPubkey', issuerPubkey, () => __awaiter(this, void 0, void 0, function* () { return (yield this.duniterServer.dal.iindexDAL.query('SELECT wotb_id FROM i_index WHERE pub = ? AND wotb_id IS NOT NULL', [issuerPubkey]))[0].wotb_id; }));
        });
    }
    getChainableOnByIssuerPubkey(issuerPubkey) {
        return this.query('SELECT `chainable_on` FROM c_index WHERE `issuer`=\'' + issuerPubkey + '\' ORDER BY `chainable_on` DESC LIMIT 1');
    }
    getChainableOnByIssuerPubkeyByExpOn(from) {
        return this.getFromCacheOrDB('getChainableOnByIssuerPubkeyByExpOn', from, () => this.query('SELECT `chainable_on` FROM c_index WHERE `issuer`=\'' + from + '\' ORDER BY `expires_on` DESC LIMIT 1'));
    }
    getCurrentBlockOrNull() {
        return this.duniterServer.dal.getCurrentBlockOrNull();
    }
    findCertsOfIssuer(pub, tmpOrder) {
        return this.getFromCacheOrDB('findCertsOfIssuer', [pub, tmpOrder].join('-'), () => this.query('SELECT `receiver`,`written_on`,`expires_on` FROM c_index WHERE `issuer`=\'' + pub + '\' ORDER BY `expires_on` ' + tmpOrder));
    }
    findCertsOfReceiver(pub, tmpOrder) {
        return this.getFromCacheOrDB('findCertsOfReceiver', [pub, tmpOrder].join('-'), () => this.query('SELECT `issuer`,`written_on`,`expires_on` FROM c_index WHERE `receiver`=\'' + pub + '\' ORDER BY `expires_on` ' + tmpOrder));
    }
    getProtagonist(pub) {
        return this.getFromCacheOrDB('getProtagonist', pub, () => this.query('SELECT `uid`,`wotb_id` FROM i_index WHERE `pub`=\'' + pub + '\' LIMIT 1'));
    }
    getCertsPending(pub, tmpOrder) {
        return this.getFromCacheOrDB('getCertsPending', [pub, tmpOrder].join('-'), () => this.query('SELECT `from`,`to`,`block_number`,`expires_on` FROM certifications_pending WHERE `from`=\'' + pub + '\' ORDER BY `expires_on` ' + tmpOrder));
    }
    getCertsPendingFromTo(pub, tmpOrder) {
        return this.getFromCacheOrDB('getCertsPendingFromTo', [pub, tmpOrder].join('-'), () => this.query('SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\'' + pub + '\' ORDER BY `expires_on` ' + tmpOrder));
    }
    getMembers() {
        return this.getFromCacheOrDB('getMembers', 'members', () => this.query('SELECT `uid`,`pub`,`member`,`written_on`,`wotb_id` FROM i_index WHERE `member`=1'));
    }
    membershipWrittenOnExpiresOn(pub) {
        return this.getFromCacheOrDB('membershipWrittenOnExpiresOn', pub, () => this.query('SELECT `written_on`,`expires_on` FROM m_index WHERE `pub`=\'' + pub + '\' ORDER BY `expires_on` DESC LIMIT 1'));
    }
    query(sql, params) {
        return this.duniterServer.dal.peerDAL.query(sql, params || []);
    }
    getFromCacheOrDB(cacheName, key, fetcher) {
        return __awaiter(this, void 0, void 0, function* () {
            const cache = this.memCache[cacheName] || (this.memCache[cacheName] = {});
            if (cache[key]) {
                return cache[key];
            }
            return cache[key] = yield fetcher();
        });
    }
    invalidateCache() {
        this.memCache = {};
    }
    getBlockWhereMedianTimeGt(previousBlockchainTime) {
        return this.getFromCacheOrDB('getBlockWhereMedianTimeGt', String(previousBlockchainTime), () => this.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` > ' + previousBlockchainTime + ' ORDER BY `medianTime` ASC'));
    }
    getBlockWhereMedianTimeLteAnd(medianTime, previousBlockchainTime) {
        return this.getFromCacheOrDB('getBlockWhereMedianTimeLteAnd', [medianTime, previousBlockchainTime].join('-'), () => this.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` <= ' + medianTime + ' AND `medianTime` > ' + previousBlockchainTime + ' ORDER BY `medianTime` ASC'));
    }
}
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "findPendingMembers", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "findPendingCertsToTarget", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getWotexInfos", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getBlock", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getUidOfPub", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getWotbIdByIssuerPubkey", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getChainableOnByIssuerPubkey", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getChainableOnByIssuerPubkeyByExpOn", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getCurrentBlockOrNull", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "findCertsOfIssuer", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "findCertsOfReceiver", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getProtagonist", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getCertsPending", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getCertsPendingFromTo", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getMembers", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "membershipWrittenOnExpiresOn", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "query", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getFromCacheOrDB", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "invalidateCache", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getBlockWhereMedianTimeGt", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getBlockWhereMedianTimeLteAnd", null);
exports.DataFinder = DataFinder;
//# sourceMappingURL=DataFinder.js.map