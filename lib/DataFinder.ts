import {Server} from 'duniter/server'
import {DBBlock} from 'duniter/app/lib/db/DBBlock'
import {MonitorExecutionTime} from './MonitorExecutionTime'
import {LevelDBIindex} from "duniter/app/lib/dal/indexDAL/leveldb/LevelDBIindex";
import {FullIindexEntry, IindexEntry, Indexer, reduce} from "duniter/app/lib/indexer";
import {LevelDBBlockchain} from "duniter/app/lib/dal/indexDAL/leveldb/LevelDBBlockchain";
import {Underscore} from "./underscore";
import {CFSBlockchainArchive} from "duniter/app/lib/dal/indexDAL/CFSBlockchainArchive";
import {MonitDBBlock, SqliteBlockchain} from "./SqliteBlockchain";
import {LevelDBCindex} from "duniter/app/lib/dal/indexDAL/leveldb/LevelDBCindex";
import {reduceConcat} from "duniter/app/lib/common-libs/reduce";
import {LevelDBMindex} from "duniter/app/lib/dal/indexDAL/leveldb/LevelDBMindex";

/**
 * Creates the DB objects + reset data + launches a first indexation
 * @param duniterServer The server to index blockchain from.
 */
export async function initMonitDB(duniterServer: Server, resetData: boolean = false) {
  DataFinder.createInstance(duniterServer)
  if (resetData) {
    await DataFinder.getInstance().resetIndexedData()
  }
  await DataFinder.getInstance().index()
}

/**
 * Abstraction layer for data access (SQL + LevelDB of Duniter).
 */
export class DataFinder {

  private static instance: DataFinder
  private static reindexing: Promise<void> = Promise.resolve()

  /**
   * Singleton constructor
   * @param duniterServer
   */
  public static createInstance(duniterServer: Server) {
    if (!DataFinder.instance) {
      DataFinder.instance = new DataFinder(duniterServer)
    }
  }

  /**
   * Singleton getter
   */
  public static getInstance() {
    return DataFinder.instance
  }

  /**
   * Retrieve the singleton + reindex Monit data if current HEAD is not up-to-date.
   */
  public static async getInstanceReindexedIfNecessary() {
    const currentMonit = await DataFinder.instance.getHighestBlock()
    const currentDuniter = await DataFinder.instance.blockchainDao.getCurrent()
    // Wait any already triggered reindexing
    await DataFinder.reindexing
    // Index only when opportune
    if (currentDuniter && (!currentMonit || currentMonit.number < currentDuniter.number)) {
      console.log('Duniter current = ', currentDuniter.number)
      console.log('Monit current = ', currentMonit && currentMonit.number || -1)
      DataFinder.reindexing = DataFinder.instance.index()
      // Wait end of indexing
      await DataFinder.reindexing
    }
    return DataFinder.instance
  }

  private dbArchives: SqliteBlockchain;
  private memCache: {
    [cacheName: string]: {
      [k: string]: any
    }
  } = {};
  private dbInited: Promise<any>

  // Cache
  private intemporalWot: Promise<IindexEntry[]>;
  private wotmap: Promise<WotMap>;

  private constructor(protected duniterServer: Server) {
    this.dbArchives = new SqliteBlockchain(duniterServer.dal.getSqliteDB)
    this.dbInited = this.dbArchives.init()
  }

  async resetIndexedData() {
    await this.dbInited
    console.log('Reseting all Monit data...')
    await this.dbArchives.deleteAll()
  }

  /**
   * Mirror the Duniter archives for long term storage
   * Renew periodically the non-archived part (in which forks may have occurred)
   */
  async index() {
    console.log('Reindexing blockchain...')
    await this.dbInited
    // 1. Look at first out-of-for-window block in Duniter: archive in Monit all the blocks < to this number
    const firstOutOfFork = await this.getFirstOutOfForkBlockInDuniter();
    const newCeil = await this.archiveBlocksInMonit(firstOutOfFork)
    // 2. Add all the blocks >= to this number
    await this.addForkWindowBlocks(newCeil, firstOutOfFork)
    console.log('Reindexing done.')
  }

  @MonitorExecutionTime()
  findPendingMembers() {
    return this.duniterServer.dal.idtyDAL.query('SELECT `buid`,`pubkey`,`uid`,`hash`,`expires_on`,`revocation_sig` FROM identities_pending WHERE `member`=0')
  }

  @MonitorExecutionTime()
  findPendingCertsToTarget(toPubkey: string, hash: string) {
    return this.getFromCacheOrDB('findPendingCertsToTarget', [toPubkey, hash].join('-'), () => this.duniterServer.dal.certDAL.query(
      'SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\''+toPubkey+'\' AND `target`=\''+hash+'\' ORDER BY `expires_on` DESC'))
  }

  @MonitorExecutionTime()
  async getWotexInfos(uid: string): Promise<{ hash: string }[]> {
    const pendingIdentities: { hash: string }[] = await this.duniterServer.dal.idtyDAL.query('' +
      'SELECT hash, uid, pubkey as pub, (SELECT NULL) AS wotb_id FROM idty WHERE uid = ?', [uid])
    const eventualMember: { hash: string }|null = await this.iindex.getFromUID(uid)
    if (eventualMember) {
      pendingIdentities.push(eventualMember)
    }
    return pendingIdentities
  }

  @MonitorExecutionTime()
  async getBlock(block_number: number): Promise<DBBlock> {
    return (await this.getFromCacheOrDB('getBlock', String(block_number),() => this.duniterServer.dal.getBlock(block_number))) || undefined
  }

  @MonitorExecutionTime()
  getUidOfPub(pub: string): Promise<{ uid: string }[]> {
    return this.getFromCacheOrDB('getUidOfPub', pub, () => this.iindex.getFullFromPubkey(pub))
  }

  @MonitorExecutionTime()
  async getWotbIdByIssuerPubkey(issuerPubkey: string) {
    return this.getFromCacheOrDB('getWotbIdByIssuerPubkey', issuerPubkey, async () => (await this.iindex.getFullFromPubkey(issuerPubkey)).wotb_id)
  }

  @MonitorExecutionTime()
  async getChainableOnByIssuerPubkey(issuerPubkey: string) {
    const reduced = await this.cindex.reducablesFrom(issuerPubkey);
    return Underscore.sortBy(reduced, r => -r.chainable_on);
  }

  @MonitorExecutionTime()
  getChainableOnByIssuerPubkeyByExpOn(from: string) {
    return this.getFromCacheOrDB('getChainableOnByIssuerPubkeyByExpOn', from, async () => {
      const reduced = await this.cindex.reducablesFrom(from);
      return Underscore.sortBy(reduced, r => -r.expires_on)[0];
    })
  }

  @MonitorExecutionTime()
  getCurrentBlockOrNull() {
    return this.duniterServer.dal.getCurrentBlockOrNull()
  }

  @MonitorExecutionTime()
  findCertsOfIssuer(pub: string, tmpOrder: string) {
    return this.getFromCacheOrDB('findCertsOfIssuer', [pub, tmpOrder].join('-'), async () => {
      const reduced = await this.cindex.reducablesFrom(pub);
      return Underscore.sortBy(reduced, r => tmpOrder === 'DESC' ? -r.expires_on : r.expires_on);
    })
  }

  @MonitorExecutionTime()
  findCertsOfReceiver(pub: any, tmpOrder: string) {
    return this.getFromCacheOrDB('findCertsOfReceiver', [pub, tmpOrder].join('-'), async () => {
      const reduced = await this.reducablesTo(pub);
      return Underscore.sortBy(reduced, r => tmpOrder === 'DESC' ? -r.expires_on : r.expires_on);
    })
  }

  @MonitorExecutionTime()
  getProtagonist(pub: string) {
    return this.getFromCacheOrDB('getProtagonist', pub, async (): Promise<FullIindexEntry> => {
      return (await this.iindex.getFromPubkey(pub)) as FullIindexEntry;
    })
  }

  @MonitorExecutionTime()
  getCertsPending(pub: string, tmpOrder: string) {
    return this.getFromCacheOrDB('getCertsPending', [pub, tmpOrder].join('-'), () => this.duniterServer.dal.certDAL.query(
      'SELECT `from`,`to`,`block_number`,`expires_on` FROM certifications_pending WHERE `from`=\''+pub+'\' ORDER BY `expires_on` '+tmpOrder))
  }

  @MonitorExecutionTime()
  getCertsPendingFromTo(pub: any, tmpOrder: string) {
    return this.getFromCacheOrDB('getCertsPendingFromTo', [pub, tmpOrder].join('-'), () => this.duniterServer.dal.certDAL.query(
      'SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\''+pub+'\' ORDER BY `expires_on` '+tmpOrder))
  }

  @MonitorExecutionTime()
  getMembers() {
    return this.getFromCacheOrDB('getMembers', 'members', async () => {
      const intemporalWot = await this.getIntemporalWot();
      return intemporalWot.filter(node => node.member)
    })
  }

  @MonitorExecutionTime()
  membershipWrittenOnExpiresOn(pub: string) {
    return this.getFromCacheOrDB('membershipWrittenOnExpiresOn', pub, async () => {
      return this.mindex.getReducedMS(pub);
    })
  }

  @MonitorExecutionTime()
  async getFromCacheOrDB<T>(cacheName: string, key: string, fetcher: () => Promise<T>) {
    const cache = this.memCache[cacheName] || (this.memCache[cacheName] = {})
    if (cache[key]) {
      return cache[key]
    }
    return cache[key] = await fetcher()
  }

  @MonitorExecutionTime()
  invalidateCache() {
    this.memCache = {}
  }

  @MonitorExecutionTime()
  getBlockWhereMedianTimeGt(previousBlockchainTime: number) {
    return this.getFromCacheOrDB('getBlockWhereMedianTimeGt', String(previousBlockchainTime),
      () => this.dbArchives.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` > '+previousBlockchainTime+' ORDER BY `medianTime` ASC'))
  }

  @MonitorExecutionTime()
  getBlockWhereMedianTimeLte(newEndTime: number) {
    return this.getFromCacheOrDB('getBlockWhereMedianTimeLte', [newEndTime].join('-'),
      () => this.dbArchives.query('SELECT `medianTime`,`number` FROM block WHERE `fork`=0 AND `medianTime` <= \''+newEndTime+'\' ORDER BY `medianTime` DESC LIMIT 1 '))
  }

  @MonitorExecutionTime()
  getBlockWhereMedianTimeLteNoLimit(medianTime: number) {
    return this.getFromCacheOrDB('getBlockWhereMedianTimeLteNoLimit', [medianTime].join('-'),
      () => this.dbArchives.query('SELECT `hash`,`membersCount`,`medianTime`,`number`,`certifications`,`issuersCount`,`powMin` FROM block WHERE `fork`=0 AND `medianTime` <= '+medianTime+' ORDER BY `medianTime` ASC'))
  }

  @MonitorExecutionTime()
  getIdentityByWotbid(wotb_id: number): Promise<any> {
    return this.getFromCacheOrDB('getIdentityByWotbid', [wotb_id].join('-'),
      async () => {
        const matching = (await this.getWotmap())[wotb_id];
        return matching
      })
  }

  @MonitorExecutionTime()
  getBlockWhereMedianTimeLteAndGtNoLimit(currentBlockTime: number, medianTime: number) {
    return this.getFromCacheOrDB('getBlockWhereMedianTimeLteAndGtNoLimit', [currentBlockTime, medianTime].join('-'),
      () => this.dbArchives.query('SELECT `hash`,`membersCount`,`medianTime`,`number`,`certifications`,`joiners`,`actives`,`revoked` FROM block WHERE `fork`=0 AND `medianTime` > '+currentBlockTime+' AND `medianTime` <= '+medianTime+' ORDER BY `medianTime` ASC'))
  }

  @MonitorExecutionTime()
  getBlockWhereMedianTimeLteAndGte(endMedianTime: number, beginMedianTime: number) {
    return this.getFromCacheOrDB('getBlockWhereMedianTimeLteAndGte', [endMedianTime, beginMedianTime].join('-'),
      () => this.dbArchives.query('SELECT `issuer`,`membersCount`,`monetaryMass`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` <= '+endMedianTime+' AND `medianTime` >= '+beginMedianTime+' ORDER BY `medianTime` ASC'))
  }

  @MonitorExecutionTime()
  getBlockWhereMedianTimeGte(beginTime: number) {
    return this.getFromCacheOrDB('getBlockWhereMedianTimeGte', String(beginTime),
      () => this.dbArchives.query('SELECT `medianTime`,`number` FROM block WHERE `fork`=0 AND `medianTime` >= \''+beginTime+'\' ORDER BY `medianTime` ASC LIMIT 1 '))
  }

  @MonitorExecutionTime()
  getBlockWhereMedianTimeLteAndGt(medianTime: number, previousBlockchainTime: number) {
    return this.getFromCacheOrDB('getBlockWhereMedianTimeLteAndGt', [medianTime, previousBlockchainTime].join('-'),
      () => this.dbArchives.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` <= '+medianTime+' AND `medianTime` > '+previousBlockchainTime+' ORDER BY `medianTime` ASC'))
  }

  @MonitorExecutionTime()
  getBlockWhereMedianTimeLteAndGteNoLimit(endMedianTime: number, beginMedianTime: number) {
    return this.getFromCacheOrDB('getBlockWhereMedianTimeLteAndGteNoLimit', [endMedianTime, beginMedianTime].join('-'),
      () => this.dbArchives.query('SELECT `issuer`,`membersCount`,`monetaryMass`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` <= '+endMedianTime+' AND `medianTime` >= '+beginMedianTime+' ORDER BY `medianTime` ASC'))
  }

  @MonitorExecutionTime()
  getBlockWhereMedianTimeGtNoLimit(beginMedianTime: number) {
    return this.getFromCacheOrDB('getBlockWhereMedianTimeGtNoLimit', String(beginMedianTime),
      () => this.dbArchives.query('SELECT `issuer`,`membersCount`,`monetaryMass`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` >= '+beginMedianTime+' ORDER BY `medianTime` ASC'))
  }

  searchIdentities(search: string) {
    return this.duniterServer.dal.searchJustIdentities(search)
  }

  /**
   * Get the highest block known by Monit
   */
  async getHighestBlock() {
    const number = await this.dbArchives.getHighestBlockNumber()
    if (number < 0) {
      return null
    }
    return this.dbArchives.getBlock(number)
  }

  /**
   * Get the highest block number known by Monit
   */
  async getHighestBlockNumber() {
    return await this.dbArchives.getHighestBlockNumber()
  }

  /**
   * Get the highest archived block number known by Monit
   */
  async getHighestArchivedBlockNumber() {
    return await this.dbArchives.getHighestArchivedBlockNumber()
  }

  @MonitorExecutionTime()
  async findRemainingBlocksInForkZone(criteria: (b: DBBlock) => boolean) {
    const topArchived = await this.getHighestBlock()
    return await this.blockchainDao.findWhere(block => (!topArchived || block.number > topArchived.number) && criteria(block))
  }

  async getFirstOutOfForkBlockInDuniter(): Promise<number> {
    const current = (await this.blockchainDao.getCurrent())
    return (current && current.number || -1) - this.duniterServer.conf.forksize
  }

  get blockchainDao() {
    return this.duniterServer.dal.blockDAL as LevelDBBlockchain
  }

  get iindex() {
    return this.duniterServer.dal.iindexDAL as LevelDBIindex
  }

  get mindex() {
    return this.duniterServer.dal.mindexDAL as LevelDBMindex
  }

  get cindex() {
    return this.duniterServer.dal.cindexDAL as LevelDBCindex
  }

  /**
   * Singleton de fetching de la wotmap
   */
  getIntemporalWot() {
    if (!this.intemporalWot) {
      this.intemporalWot = this.fetchIntemporalWot()
    }
    return this.intemporalWot
  }

  /**
   * Singleton de fetching de la wotmap
   */
  getWotmap() {
    if (!this.wotmap) {
      this.wotmap = this.fetchWotMap()
    }
    return this.wotmap
  }

  async fetchIntemporalWot() {
    console.log('Fetching intemporal wot...');
    return (await this.iindex.findAllValues()).map(reduce);
  }

  async fetchWotMap() {
    console.log('Fetching wotmap...');
    const reducedIdentities = await this.getIntemporalWot();
    const wotmap: WotMap = {};
    reducedIdentities.forEach(identity => {
      wotmap[identity.wotb_id as number] = identity;
    });
    return wotmap;
  }

  // Extracted from Duniter `getValidLinksTo`, adapted to return even non-valid links
  private async reducablesTo(receiver: any) {
    const issuers: string[] = ((await this.cindex.getOrNull(receiver)) || { issued: [], received: [] }).received
    return (await Promise.all(issuers.map(async issuer => {
      const fullEntries = Indexer.DUP_HELPERS.reduceBy((await this.cindex.get(issuer)).issued, ['issuer', 'receiver'])
      return fullEntries.filter(e => e.receiver === receiver )
    }))).reduce(reduceConcat, [])
  }

  /**
   * Save as archived blocks in Monit blocks the blocks that are not supposed to change
   * ever in Duniter (non-fork blocks).
   */
  private async archiveBlocksInMonit(targetCeil: number) {
    console.log(`[Archives] Compiling archives up to #${targetCeil} (first non-forkable block)...`)
    // Trim all the blocks above the ceil (should be the non-archived blocks)
    console.log(`[Archives] Removing forkable blocks`)
    await this.dbArchives.trimNonArchived()
    // Check what is our new ceil
    let currentCeil = await this.dbArchives.getHighestBlockNumber()
    // Copy the blocks available from Duniter archives (they were stored during a sync)
    currentCeil = await this.copyFromDuniterArchives(currentCeil, targetCeil)
    // Then copy the bocks available in classical Duniter DB (a part stored during the sync, the other during the node's life)
    currentCeil = await this.copyFromDuniterDB(currentCeil, targetCeil)
    return this.dbArchives.getHighestBlockNumber()
  }

  /**
   * Save as non-archived blocks in Monit blocks the blocks that are in fork window of Duniter.
   */
  private async addForkWindowBlocks(newCeil: number, firstOutOfFork: number) {
    console.log(`[Forkables] Copying DB blocks from #${newCeil + 1} to #${firstOutOfFork}...`)
    const current = (await this.blockchainDao.getCurrent()) as DBBlock
    // Fetch memory blocks above our new ceil
    const nonArchived: MonitDBBlock[] = await this.blockchainDao.getBlocks(newCeil + 1, firstOutOfFork) as any
    // Mark them as non-archived
    nonArchived.forEach(b => b.archived = true)
    console.log(`[Forkables] Copying ${nonArchived.length} blocks.`)
    await this.dbArchives.insertBatch(nonArchived)
    console.log(`[Forkables] Copying DB forkable blocks from #${firstOutOfFork + 1} to #${current.number}...`)
    // Fetch memory blocks above our new ceil
    const nonArchivedForkable: MonitDBBlock[] = await this.blockchainDao.getBlocks(firstOutOfFork + 1, current.number) as any
    // Mark them as non-archived because they are forkable
    nonArchivedForkable.forEach(b => b.archived = false)
    // And finally store them
    console.log(`[Forkables] Copying ${nonArchivedForkable.length} blocks.`)
    await this.dbArchives.insertBatch(nonArchivedForkable)
  }

  /**
   * Extract blocks from Duniter archives zone.
   * @param currentCeil Our current ceil block in dbArchives.
   * @param targetCeil  Our target block in dbArchives (block to reach).
   */
  private async copyFromDuniterArchives(currentCeil: number, targetCeil: number) {
    console.log(`[Archives] Copying from Duniter archives from #${currentCeil + 1}...#${targetCeil}`)
    while (currentCeil < targetCeil) {
      // Get the chunk that contains the block following our current ceil
      const chunk: MonitDBBlock[]|null = (await (this.duniterServer.dal.blockchainArchiveDAL as CFSBlockchainArchive<DBBlock>).getChunkForBlock(currentCeil + 1)) as any[];
      const toArchive: MonitDBBlock[] = [];
      if (!chunk) {
        // Not in the archives
        break;
      }
      for (const block of chunk) {
        if (block.number > currentCeil) {
          // Archive it
          block.archived = true;
          toArchive.push(block);
          currentCeil = block.number
        }
      }
      if (toArchive.length) {
        console.log(`[Archives] Copying from Duniter archives block #${toArchive[0].number}...#${toArchive[toArchive.length-1].number}`)
        await this.dbArchives.insertBatch(toArchive)
        // Force journal writing, otherwise we will have to wait for all the writings later on.
        // I prefer to wait now, to follow the progress using logs
        await this.dbArchives.getHighestBlockNumber()
      }
    }
    await this.dbArchives.setArchived(currentCeil)
    console.log(`[Archives] Copying from Duniter archives done.`)
    return currentCeil
  }

  /**
   * Extract blocks from Duniter database zone.
   * @param currentCeil Our current ceil block in dbArchives.
   * @param targetCeil  Our target block in dbArchives (block to reach).
   */
  private async copyFromDuniterDB(currentCeil: number, targetCeil: number) {
    console.log('[Archives] Copying from Duniter DB...')
    const duniterCurrent = await this.blockchainDao.getCurrent()
    if (duniterCurrent) {
      // Get all the remaining blocks
      console.log(`[Archives] Copying from Duniter DB block #${currentCeil + 1}...#${targetCeil}`)
      const chunk: MonitDBBlock[]|null = (await this.blockchainDao.getBlocks(currentCeil + 1, targetCeil)) as any[];
      const toStore: MonitDBBlock[] = [];
      for (const block of chunk) {
        if (!block.fork && block.number === currentCeil + 1) {
          // Store it
          block.archived = block.number <= duniterCurrent.number;
          toStore.push(block);
          currentCeil = block.number
        }
      }
      console.log(`[Archives] Copying ${toStore.length} blocks...`)
      if (toStore.length) {
        await this.dbArchives.insertBatch(toStore)
      }
    }
    console.log('[Archives] Copying from Duniter DB done.')
    return currentCeil
  }
}

interface WotMap {
  [k: number]: IindexEntry
}
