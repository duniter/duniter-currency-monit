import { Server } from 'duniter/server';
import { DBBlock } from 'duniter/app/lib/db/DBBlock';
import { LevelDBIindex } from "duniter/app/lib/dal/indexDAL/leveldb/LevelDBIindex";
import { IindexEntry } from "duniter/app/lib/indexer";
import { LevelDBBlockchain } from "duniter/app/lib/dal/indexDAL/leveldb/LevelDBBlockchain";
import { MonitDBBlock } from "./SqliteBlockchain";
import { LevelDBCindex } from "duniter/app/lib/dal/indexDAL/leveldb/LevelDBCindex";
import { LevelDBMindex } from "duniter/app/lib/dal/indexDAL/leveldb/LevelDBMindex";
/**
 * Creates the DB objects + reset data + launches a first indexation
 * @param duniterServer The server to index blockchain from.
 */
export declare function initMonitDB(duniterServer: Server, resetData?: boolean): Promise<void>;
/**
 * Abstraction layer for data access (SQL + LevelDB of Duniter).
 */
export declare class DataFinder {
    protected duniterServer: Server;
    private static instance;
    private static reindexing;
    /**
     * Singleton constructor
     * @param duniterServer
     */
    static createInstance(duniterServer: Server): void;
    /**
     * Singleton getter
     */
    static getInstance(): DataFinder;
    /**
     * Retrieve the singleton + reindex Monit data if current HEAD is not up-to-date.
     */
    static getInstanceReindexedIfNecessary(): Promise<DataFinder>;
    private dbArchives;
    private memCache;
    private dbInited;
    private intemporalWot;
    private wotmap;
    private constructor();
    resetIndexedData(): Promise<void>;
    /**
     * Mirror the Duniter archives for long term storage
     * Renew periodically the non-archived part (in which forks may have occurred)
     */
    index(): Promise<void>;
    findPendingMembers(): Promise<import("duniter/app/lib/dal/sqliteDAL/IdentityDAL").DBIdentity[]>;
    findPendingCertsToTarget(toPubkey: string, hash: string): Promise<any>;
    getWotexInfos(uid: string): Promise<{
        hash: string;
    }[]>;
    getBlock(block_number: number): Promise<DBBlock>;
    getUidOfPub(pub: string): Promise<{
        uid: string;
    }[]>;
    getWotbIdByIssuerPubkey(issuerPubkey: string): Promise<any>;
    getChainableOnByIssuerPubkey(issuerPubkey: string): Promise<import("duniter/app/lib/indexer").FullCindexEntry[]>;
    getChainableOnByIssuerPubkeyByExpOn(from: string): Promise<any>;
    getCurrentBlockOrNull(): Promise<DBBlock | null>;
    findCertsOfIssuer(pub: string, tmpOrder: string): Promise<any>;
    findCertsOfReceiver(pub: any, tmpOrder: string): Promise<any>;
    getProtagonist(pub: string): Promise<any>;
    getCertsPending(pub: string, tmpOrder: string): Promise<any>;
    getCertsPendingFromTo(pub: any, tmpOrder: string): Promise<any>;
    getMembers(): Promise<any>;
    membershipWrittenOnExpiresOn(pub: string): Promise<any>;
    getFromCacheOrDB<T>(cacheName: string, key: string, fetcher: () => Promise<T>): Promise<any>;
    invalidateCache(): void;
    getBlockWhereMedianTimeGt(previousBlockchainTime: number): Promise<any>;
    getBlockWhereMedianTimeLte(newEndTime: number): Promise<any>;
    getBlockWhereMedianTimeLteNoLimit(medianTime: number): Promise<any>;
    getIdentityByWotbid(wotb_id: number): Promise<any>;
    getBlockWhereMedianTimeLteAndGtNoLimit(currentBlockTime: number, medianTime: number): Promise<any>;
    getBlockWhereMedianTimeLteAndGte(endMedianTime: number, beginMedianTime: number): Promise<any>;
    getBlockWhereMedianTimeGte(beginTime: number): Promise<any>;
    getBlockWhereMedianTimeLteAndGt(medianTime: number, previousBlockchainTime: number): Promise<any>;
    getBlockWhereMedianTimeLteAndGteNoLimit(endMedianTime: number, beginMedianTime: number): Promise<any>;
    getBlockWhereMedianTimeGtNoLimit(beginMedianTime: number): Promise<any>;
    searchIdentities(search: string): Promise<import("duniter/app/lib/dal/sqliteDAL/IdentityDAL").DBIdentity[]>;
    /**
     * Get the highest block known by Monit
     */
    getHighestBlock(): Promise<MonitDBBlock | null>;
    /**
     * Get the highest block number known by Monit
     */
    getHighestBlockNumber(): Promise<number>;
    /**
     * Get the highest archived block number known by Monit
     */
    getHighestArchivedBlockNumber(): Promise<number>;
    findRemainingBlocksInForkZone(criteria: (b: DBBlock) => boolean): Promise<DBBlock[]>;
    getFirstOutOfForkBlockInDuniter(): Promise<number>;
    get blockchainDao(): LevelDBBlockchain;
    get iindex(): LevelDBIindex;
    get mindex(): LevelDBMindex;
    get cindex(): LevelDBCindex;
    /**
     * Singleton de fetching de la wotmap
     */
    getIntemporalWot(): Promise<IindexEntry[]>;
    /**
     * Singleton de fetching de la wotmap
     */
    getWotmap(): Promise<WotMap>;
    fetchIntemporalWot(): Promise<IindexEntry[]>;
    fetchWotMap(): Promise<WotMap>;
    private reducablesTo;
    /**
     * Save as archived blocks in Monit blocks the blocks that are not supposed to change
     * ever in Duniter (non-fork blocks).
     */
    private archiveBlocksInMonit;
    /**
     * Save as non-archived blocks in Monit blocks the blocks that are in fork window of Duniter.
     */
    private addForkWindowBlocks;
    /**
     * Extract blocks from Duniter archives zone.
     * @param currentCeil Our current ceil block in dbArchives.
     * @param targetCeil  Our target block in dbArchives (block to reach).
     */
    private copyFromDuniterArchives;
    /**
     * Extract blocks from Duniter database zone.
     * @param currentCeil Our current ceil block in dbArchives.
     * @param targetCeil  Our target block in dbArchives (block to reach).
     */
    private copyFromDuniterDB;
}
interface WotMap {
    [k: number]: IindexEntry;
}
export {};
