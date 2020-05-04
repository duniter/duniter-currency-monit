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
const indexer_1 = require("duniter/app/lib/indexer");
const underscore_1 = require("./underscore");
const SqliteBlockchain_1 = require("./SqliteBlockchain");
const reduce_1 = require("duniter/app/lib/common-libs/reduce");
/**
 * Creates the DB objects + reset data + launches a first indexation
 * @param duniterServer The server to index blockchain from.
 */
function initMonitDB(duniterServer, resetData = false) {
    return __awaiter(this, void 0, void 0, function* () {
        DataFinder.createInstance(duniterServer);
        if (resetData) {
            yield DataFinder.getInstance().resetIndexedData();
        }
        yield DataFinder.getInstance().index();
    });
}
exports.initMonitDB = initMonitDB;
/**
 * Abstraction layer for data access (SQL + LevelDB of Duniter).
 */
class DataFinder {
    constructor(duniterServer) {
        this.duniterServer = duniterServer;
        this.memCache = {};
        this.dbArchives = new SqliteBlockchain_1.SqliteBlockchain(duniterServer.dal.getSqliteDB);
        this.dbInited = this.dbArchives.init();
    }
    /**
     * Singleton constructor
     * @param duniterServer
     */
    static createInstance(duniterServer) {
        if (!DataFinder.instance) {
            DataFinder.instance = new DataFinder(duniterServer);
        }
    }
    /**
     * Singleton getter
     */
    static getInstance() {
        return DataFinder.instance;
    }
    /**
     * Retrieve the singleton + reindex Monit data if current HEAD is not up-to-date.
     */
    static getInstanceReindexedIfNecessary() {
        return __awaiter(this, void 0, void 0, function* () {
            const currentMonit = yield DataFinder.instance.getHighestBlock();
            const currentDuniter = yield DataFinder.instance.blockchainDao.getCurrent();
            // Wait any already triggered reindexing
            yield DataFinder.reindexing;
            // Index only when opportune
            if (currentDuniter && (!currentMonit || currentMonit.number < currentDuniter.number)) {
                console.log('Duniter current = ', currentDuniter.number);
                console.log('Monit current = ', currentMonit && currentMonit.number || -1);
                DataFinder.reindexing = DataFinder.instance.index();
                // Wait end of indexing
                yield DataFinder.reindexing;
            }
            return DataFinder.instance;
        });
    }
    resetIndexedData() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.dbInited;
            console.log('Reseting all Monit data...');
            yield this.dbArchives.deleteAll();
        });
    }
    /**
     * Mirror the Duniter archives for long term storage
     * Renew periodically the non-archived part (in which forks may have occurred)
     */
    index() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('Reindexing blockchain...');
            yield this.dbInited;
            // 1. Look at first out-of-for-window block in Duniter: archive in Monit all the blocks < to this number
            const firstOutOfFork = yield this.getFirstOutOfForkBlockInDuniter();
            const newCeil = yield this.archiveBlocksInMonit(firstOutOfFork);
            // 2. Add all the blocks >= to this number
            yield this.addForkWindowBlocks(newCeil, firstOutOfFork);
            console.log('Reindexing done.');
        });
    }
    findPendingMembers() {
        return this.duniterServer.dal.idtyDAL.query('SELECT `buid`,`pubkey`,`uid`,`hash`,`expires_on`,`revocation_sig` FROM identities_pending WHERE `member`=0');
    }
    findPendingCertsToTarget(toPubkey, hash) {
        return this.getFromCacheOrDB('findPendingCertsToTarget', [toPubkey, hash].join('-'), () => this.duniterServer.dal.certDAL.query('SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\'' + toPubkey + '\' AND `target`=\'' + hash + '\' ORDER BY `expires_on` DESC'));
    }
    getWotexInfos(uid) {
        return __awaiter(this, void 0, void 0, function* () {
            const pendingIdentities = yield this.duniterServer.dal.idtyDAL.query('' +
                'SELECT hash, uid, pubkey as pub, (SELECT NULL) AS wotb_id FROM idty WHERE uid = ?', [uid]);
            const eventualMember = yield this.iindex.getFromUID(uid);
            if (eventualMember) {
                pendingIdentities.push(eventualMember);
            }
            return pendingIdentities;
        });
    }
    getBlock(block_number) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.getFromCacheOrDB('getBlock', String(block_number), () => this.duniterServer.dal.getBlock(block_number))) || undefined;
        });
    }
    getUidOfPub(pub) {
        return this.getFromCacheOrDB('getUidOfPub', pub, () => __awaiter(this, void 0, void 0, function* () {
            const entry = yield this.iindex.getFullFromPubkey(pub);
            if (!entry.uid) {
                // Not found
                return [];
            }
            return [entry];
        }));
    }
    getWotbIdByIssuerPubkey(issuerPubkey) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getFromCacheOrDB('getWotbIdByIssuerPubkey', issuerPubkey, () => __awaiter(this, void 0, void 0, function* () { return (yield this.iindex.getFullFromPubkey(issuerPubkey)).wotb_id; }));
        });
    }
    getChainableOnByIssuerPubkey(issuerPubkey) {
        return __awaiter(this, void 0, void 0, function* () {
            const reduced = yield this.cindex.reducablesFrom(issuerPubkey);
            return underscore_1.Underscore.sortBy(reduced, r => -r.chainable_on);
        });
    }
    getChainableOnByIssuerPubkeyByExpOn(from) {
        return this.getFromCacheOrDB('getChainableOnByIssuerPubkeyByExpOn', from, () => __awaiter(this, void 0, void 0, function* () {
            const reduced = yield this.cindex.reducablesFrom(from);
            return underscore_1.Underscore.sortBy(reduced, r => -r.expires_on)[0];
        }));
    }
    getCurrentBlockOrNull() {
        return this.duniterServer.dal.getCurrentBlockOrNull();
    }
    findCertsOfIssuer(pub, tmpOrder) {
        return this.getFromCacheOrDB('findCertsOfIssuer', [pub, tmpOrder].join('-'), () => __awaiter(this, void 0, void 0, function* () {
            const reduced = yield this.cindex.reducablesFrom(pub);
            return underscore_1.Underscore.sortBy(reduced, r => tmpOrder === 'DESC' ? -r.expires_on : r.expires_on);
        }));
    }
    findCertsOfReceiver(pub, tmpOrder) {
        return this.getFromCacheOrDB('findCertsOfReceiver', [pub, tmpOrder].join('-'), () => __awaiter(this, void 0, void 0, function* () {
            const reduced = yield this.reducablesTo(pub);
            return underscore_1.Underscore.sortBy(reduced, r => tmpOrder === 'DESC' ? -r.expires_on : r.expires_on);
        }));
    }
    getProtagonist(pub) {
        return this.getFromCacheOrDB('getProtagonist', pub, () => __awaiter(this, void 0, void 0, function* () {
            return (yield this.iindex.getFromPubkey(pub));
        }));
    }
    getCertsPending(pub, tmpOrder) {
        return this.getFromCacheOrDB('getCertsPending', [pub, tmpOrder].join('-'), () => this.duniterServer.dal.certDAL.query('SELECT `from`,`to`,`block_number`,`expires_on` FROM certifications_pending WHERE `from`=\'' + pub + '\' ORDER BY `expires_on` ' + tmpOrder));
    }
    getCertsPendingFromTo(pub, tmpOrder) {
        return this.getFromCacheOrDB('getCertsPendingFromTo', [pub, tmpOrder].join('-'), () => this.duniterServer.dal.certDAL.query('SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\'' + pub + '\' ORDER BY `expires_on` ' + tmpOrder));
    }
    getMembers() {
        return this.getFromCacheOrDB('getMembers', 'members', () => __awaiter(this, void 0, void 0, function* () {
            const intemporalWot = yield this.getIntemporalWot();
            return intemporalWot.filter(node => node.member);
        }));
    }
    membershipWrittenOnExpiresOn(pub) {
        return this.getFromCacheOrDB('membershipWrittenOnExpiresOn', pub, () => __awaiter(this, void 0, void 0, function* () {
            return this.mindex.getReducedMS(pub);
        }));
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
        return this.getFromCacheOrDB('getBlockWhereMedianTimeGt', String(previousBlockchainTime), () => this.dbArchives.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` > ' + previousBlockchainTime + ' ORDER BY `medianTime` ASC'));
    }
    getBlockWhereMedianTimeLte(newEndTime) {
        return this.getFromCacheOrDB('getBlockWhereMedianTimeLte', [newEndTime].join('-'), () => this.dbArchives.query('SELECT `medianTime`,`number` FROM block WHERE `fork`=0 AND `medianTime` <= \'' + newEndTime + '\' ORDER BY `medianTime` DESC LIMIT 1 '));
    }
    getBlockWhereMedianTimeLteNoLimit(medianTime) {
        return this.getFromCacheOrDB('getBlockWhereMedianTimeLteNoLimit', [medianTime].join('-'), () => this.dbArchives.query('SELECT `hash`,`membersCount`,`medianTime`,`number`,`certifications`,`issuersCount`,`powMin` FROM block WHERE `fork`=0 AND `medianTime` <= ' + medianTime + ' ORDER BY `medianTime` ASC'));
    }
    getIdentityByWotbid(wotb_id) {
        return this.getFromCacheOrDB('getIdentityByWotbid', [wotb_id].join('-'), () => __awaiter(this, void 0, void 0, function* () {
            const matching = (yield this.getWotmap())[wotb_id];
            return matching;
        }));
    }
    getBlockWhereMedianTimeLteAndGtNoLimit(currentBlockTime, medianTime) {
        return this.getFromCacheOrDB('getBlockWhereMedianTimeLteAndGtNoLimit', [currentBlockTime, medianTime].join('-'), () => this.dbArchives.query('SELECT `hash`,`membersCount`,`medianTime`,`number`,`certifications`,`joiners`,`actives`,`revoked` FROM block WHERE `fork`=0 AND `medianTime` > ' + currentBlockTime + ' AND `medianTime` <= ' + medianTime + ' ORDER BY `medianTime` ASC'));
    }
    getBlockWhereMedianTimeLteAndGte(endMedianTime, beginMedianTime) {
        return this.getFromCacheOrDB('getBlockWhereMedianTimeLteAndGte', [endMedianTime, beginMedianTime].join('-'), () => this.dbArchives.query('SELECT `issuer`,`membersCount`,`monetaryMass`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` <= ' + endMedianTime + ' AND `medianTime` >= ' + beginMedianTime + ' ORDER BY `medianTime` ASC'));
    }
    getBlockWhereMedianTimeGte(beginTime) {
        return this.getFromCacheOrDB('getBlockWhereMedianTimeGte', String(beginTime), () => this.dbArchives.query('SELECT `medianTime`,`number` FROM block WHERE `fork`=0 AND `medianTime` >= \'' + beginTime + '\' ORDER BY `medianTime` ASC LIMIT 1 '));
    }
    getBlockWhereMedianTimeLteAndGt(medianTime, previousBlockchainTime) {
        return this.getFromCacheOrDB('getBlockWhereMedianTimeLteAndGt', [medianTime, previousBlockchainTime].join('-'), () => this.dbArchives.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` <= ' + medianTime + ' AND `medianTime` > ' + previousBlockchainTime + ' ORDER BY `medianTime` ASC'));
    }
    getBlockWhereMedianTimeLteAndGteNoLimit(endMedianTime, beginMedianTime) {
        return this.getFromCacheOrDB('getBlockWhereMedianTimeLteAndGteNoLimit', [endMedianTime, beginMedianTime].join('-'), () => this.dbArchives.query('SELECT `issuer`,`membersCount`,`monetaryMass`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` <= ' + endMedianTime + ' AND `medianTime` >= ' + beginMedianTime + ' ORDER BY `medianTime` ASC'));
    }
    getBlockWhereMedianTimeGtNoLimit(beginMedianTime) {
        return this.getFromCacheOrDB('getBlockWhereMedianTimeGtNoLimit', String(beginMedianTime), () => this.dbArchives.query('SELECT `issuer`,`membersCount`,`monetaryMass`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` >= ' + beginMedianTime + ' ORDER BY `medianTime` ASC'));
    }
    searchIdentities(search) {
        return this.duniterServer.dal.searchJustIdentities(search);
    }
    /**
     * Get the highest block known by Monit
     */
    getHighestBlock() {
        return __awaiter(this, void 0, void 0, function* () {
            const number = yield this.dbArchives.getHighestBlockNumber();
            if (number < 0) {
                return null;
            }
            return this.dbArchives.getBlock(number);
        });
    }
    /**
     * Get the highest block number known by Monit
     */
    getHighestBlockNumber() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.dbArchives.getHighestBlockNumber();
        });
    }
    /**
     * Get the highest archived block number known by Monit
     */
    getHighestArchivedBlockNumber() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.dbArchives.getHighestArchivedBlockNumber();
        });
    }
    findRemainingBlocksInForkZone(criteria) {
        return __awaiter(this, void 0, void 0, function* () {
            const topArchived = yield this.getHighestBlock();
            return yield this.blockchainDao.findWhere(block => (!topArchived || block.number > topArchived.number) && criteria(block));
        });
    }
    getFirstOutOfForkBlockInDuniter() {
        return __awaiter(this, void 0, void 0, function* () {
            const current = (yield this.blockchainDao.getCurrent());
            return (current && current.number || -1) - this.duniterServer.conf.forksize;
        });
    }
    get blockchainDao() {
        return this.duniterServer.dal.blockDAL;
    }
    get iindex() {
        return this.duniterServer.dal.iindexDAL;
    }
    get mindex() {
        return this.duniterServer.dal.mindexDAL;
    }
    get cindex() {
        return this.duniterServer.dal.cindexDAL;
    }
    /**
     * Singleton de fetching de la wotmap
     */
    getIntemporalWot() {
        if (!this.intemporalWot) {
            this.intemporalWot = this.fetchIntemporalWot();
        }
        return this.intemporalWot;
    }
    /**
     * Singleton de fetching de la wotmap
     */
    getWotmap() {
        if (!this.wotmap) {
            this.wotmap = this.fetchWotMap();
        }
        return this.wotmap;
    }
    fetchIntemporalWot() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('Fetching intemporal wot...');
            return (yield this.iindex.findAllValues()).map(indexer_1.reduce);
        });
    }
    fetchWotMap() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('Fetching wotmap...');
            const reducedIdentities = yield this.getIntemporalWot();
            const wotmap = {};
            reducedIdentities.forEach(identity => {
                wotmap[identity.wotb_id] = identity;
            });
            return wotmap;
        });
    }
    // Extracted from Duniter `getValidLinksTo`, adapted to return even non-valid links
    reducablesTo(receiver) {
        return __awaiter(this, void 0, void 0, function* () {
            const issuers = ((yield this.cindex.getOrNull(receiver)) || { issued: [], received: [] }).received;
            return (yield Promise.all(issuers.map((issuer) => __awaiter(this, void 0, void 0, function* () {
                const fullEntries = indexer_1.Indexer.DUP_HELPERS.reduceBy((yield this.cindex.get(issuer)).issued, ['issuer', 'receiver']);
                return fullEntries.filter(e => e.receiver === receiver);
            })))).reduce(reduce_1.reduceConcat, []);
        });
    }
    /**
     * Save as archived blocks in Monit blocks the blocks that are not supposed to change
     * ever in Duniter (non-fork blocks).
     */
    archiveBlocksInMonit(targetCeil) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`[Archives] Compiling archives up to #${targetCeil} (first non-forkable block)...`);
            // Trim all the blocks above the ceil (should be the non-archived blocks)
            console.log(`[Archives] Removing forkable blocks`);
            yield this.dbArchives.trimNonArchived();
            // Check what is our new ceil
            let currentCeil = yield this.dbArchives.getHighestBlockNumber();
            // Copy the blocks available from Duniter archives (they were stored during a sync)
            currentCeil = yield this.copyFromDuniterArchives(currentCeil, targetCeil);
            // Then copy the bocks available in classical Duniter DB (a part stored during the sync, the other during the node's life)
            currentCeil = yield this.copyFromDuniterDB(currentCeil, targetCeil);
            return this.dbArchives.getHighestBlockNumber();
        });
    }
    /**
     * Save as non-archived blocks in Monit blocks the blocks that are in fork window of Duniter.
     */
    addForkWindowBlocks(newCeil, firstOutOfFork) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`[Forkables] Copying DB blocks from #${newCeil + 1} to #${firstOutOfFork}...`);
            const current = (yield this.blockchainDao.getCurrent());
            // Fetch memory blocks above our new ceil
            const nonArchived = yield this.blockchainDao.getBlocks(newCeil + 1, firstOutOfFork);
            // Mark them as non-archived
            nonArchived.forEach(b => b.archived = true);
            console.log(`[Forkables] Copying ${nonArchived.length} blocks.`);
            yield this.dbArchives.insertBatch(nonArchived);
            console.log(`[Forkables] Copying DB forkable blocks from #${firstOutOfFork + 1} to #${current.number}...`);
            // Fetch memory blocks above our new ceil
            const nonArchivedForkable = yield this.blockchainDao.getBlocks(firstOutOfFork + 1, current.number);
            // Mark them as non-archived because they are forkable
            nonArchivedForkable.forEach(b => b.archived = false);
            // And finally store them
            console.log(`[Forkables] Copying ${nonArchivedForkable.length} blocks.`);
            yield this.dbArchives.insertBatch(nonArchivedForkable);
        });
    }
    /**
     * Extract blocks from Duniter archives zone.
     * @param currentCeil Our current ceil block in dbArchives.
     * @param targetCeil  Our target block in dbArchives (block to reach).
     */
    copyFromDuniterArchives(currentCeil, targetCeil) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`[Archives] Copying from Duniter archives from #${currentCeil + 1}...#${targetCeil}`);
            while (currentCeil < targetCeil) {
                // Get the chunk that contains the block following our current ceil
                const chunk = (yield this.duniterServer.dal.blockchainArchiveDAL.getChunkForBlock(currentCeil + 1));
                const toArchive = [];
                if (!chunk) {
                    // Not in the archives
                    break;
                }
                for (const block of chunk) {
                    if (block.number > currentCeil) {
                        // Archive it
                        block.archived = true;
                        toArchive.push(block);
                        currentCeil = block.number;
                    }
                }
                if (toArchive.length) {
                    console.log(`[Archives] Copying from Duniter archives block #${toArchive[0].number}...#${toArchive[toArchive.length - 1].number}`);
                    yield this.dbArchives.insertBatch(toArchive);
                    // Force journal writing, otherwise we will have to wait for all the writings later on.
                    // I prefer to wait now, to follow the progress using logs
                    yield this.dbArchives.getHighestBlockNumber();
                }
            }
            yield this.dbArchives.setArchived(currentCeil);
            console.log(`[Archives] Copying from Duniter archives done.`);
            return currentCeil;
        });
    }
    /**
     * Extract blocks from Duniter database zone.
     * @param currentCeil Our current ceil block in dbArchives.
     * @param targetCeil  Our target block in dbArchives (block to reach).
     */
    copyFromDuniterDB(currentCeil, targetCeil) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('[Archives] Copying from Duniter DB...');
            const duniterCurrent = yield this.blockchainDao.getCurrent();
            if (duniterCurrent) {
                // Get all the remaining blocks
                console.log(`[Archives] Copying from Duniter DB block #${currentCeil + 1}...#${targetCeil}`);
                const chunk = (yield this.blockchainDao.getBlocks(currentCeil + 1, targetCeil));
                const toStore = [];
                for (const block of chunk) {
                    if (!block.fork && block.number === currentCeil + 1) {
                        // Store it
                        block.archived = block.number <= duniterCurrent.number;
                        toStore.push(block);
                        currentCeil = block.number;
                    }
                }
                console.log(`[Archives] Copying ${toStore.length} blocks...`);
                if (toStore.length) {
                    yield this.dbArchives.insertBatch(toStore);
                }
            }
            console.log('[Archives] Copying from Duniter DB done.');
            return currentCeil;
        });
    }
}
DataFinder.reindexing = Promise.resolve();
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
], DataFinder.prototype, "getFromCacheOrDB", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "invalidateCache", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getBlockWhereMedianTimeGt", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getBlockWhereMedianTimeLte", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getBlockWhereMedianTimeLteNoLimit", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getIdentityByWotbid", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getBlockWhereMedianTimeLteAndGtNoLimit", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getBlockWhereMedianTimeLteAndGte", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getBlockWhereMedianTimeGte", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getBlockWhereMedianTimeLteAndGt", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getBlockWhereMedianTimeLteAndGteNoLimit", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "getBlockWhereMedianTimeGtNoLimit", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], DataFinder.prototype, "findRemainingBlocksInForkZone", null);
exports.DataFinder = DataFinder;
//# sourceMappingURL=DataFinder.js.map