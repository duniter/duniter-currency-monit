import { Server } from 'duniter/server';
import { DBBlock } from 'duniter/app/lib/db/DBBlock';
export declare class DataFinder {
    protected duniterServer: Server;
    private memCache;
    constructor(duniterServer: Server);
    findPendingMembers(): any;
    findPendingCertsToTarget(toPubkey: string, hash: string): Promise<any>;
    getWotexInfos(uid: string): Promise<import("duniter/app/lib/dal/sqliteDAL/IdentityDAL").DBIdentity[]>;
    getBlock(block_number: number): Promise<DBBlock | undefined>;
    getUidOfPub(pub: string): Promise<{
        uid: string;
    }[]>;
    getWotbIdByIssuerPubkey(issuerPubkey: string): Promise<any>;
    getChainableOnByIssuerPubkey(issuerPubkey: string): any;
    getChainableOnByIssuerPubkeyByExpOn(from: string): Promise<any>;
    getCurrentBlockOrNull(): Promise<DBBlock>;
    findCertsOfIssuer(pub: string, tmpOrder: string): Promise<any>;
    findCertsOfReceiver(pub: any, tmpOrder: string): Promise<any>;
    getProtagonist(pub: string): Promise<any>;
    getCertsPending(pub: string, tmpOrder: string): Promise<any>;
    getCertsPendingFromTo(pub: any, tmpOrder: string): Promise<any>;
    getMembers(): Promise<any>;
    membershipWrittenOnExpiresOn(pub: string): Promise<any>;
    query(sql: string, params?: any[]): any;
    getFromCacheOrDB<T>(cacheName: string, key: string, fetcher: () => Promise<T>): Promise<any>;
    invalidateCache(): void;
    getBlockWhereMedianTimeGt(previousBlockchainTime: number): Promise<any>;
    getBlockWhereMedianTimeLteAnd(medianTime: number, previousBlockchainTime: number): Promise<any>;
}
