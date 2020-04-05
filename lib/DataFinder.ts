import {Server} from 'duniter/server'
import {DBBlock} from 'duniter/app/lib/db/DBBlock'
import {MonitorExecutionTime} from './MonitorExecutionTime'

export class DataFinder {

  private memCache: {
    [cacheName: string]: {
      [k: string]: any
    }
  } = {}

  constructor(protected duniterServer: Server) {
  }

  @MonitorExecutionTime()
  findPendingMembers() {
    return this.query('SELECT `buid`,`pubkey`,`uid`,`hash`,`expires_on`,`revocation_sig` FROM identities_pending WHERE `member`=0')
  }

  @MonitorExecutionTime()
  findPendingCertsToTarget(toPubkey: string, hash: string) {
    return this.getFromCacheOrDB('findPendingCertsToTarget', [toPubkey, hash].join('-'), () => this.query(
      'SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\''+toPubkey+'\' AND `target`=\''+hash+'\' ORDER BY `expires_on` DESC'))
  }

  @MonitorExecutionTime()
  getWotexInfos(uid: string) {
    return this.duniterServer.dal.idtyDAL.query('' +
      'SELECT hash, uid, pub, wotb_id FROM i_index WHERE uid = ? ' +
      'UNION ALL ' + 'SELECT hash, uid, pubkey as pub, (SELECT NULL) AS wotb_id FROM idty WHERE uid = ?', [uid, uid])
  }

  @MonitorExecutionTime()
  async getBlock(block_number: number): Promise<DBBlock|undefined> {
    return (await this.getFromCacheOrDB('getBlock', String(block_number),() => this.duniterServer.dal.getBlock(block_number))) || undefined
  }

  @MonitorExecutionTime()
  getUidOfPub(pub: string): Promise<{ uid: string }[]> {
    return this.getFromCacheOrDB('getUidOfPub', pub, () => this.query('SELECT `uid` FROM i_index WHERE `pub`=\''+pub+'\' LIMIT 1'))
  }

  @MonitorExecutionTime()
  async getWotbIdByIssuerPubkey(issuerPubkey: string) {
    return this.getFromCacheOrDB('getWotbIdByIssuerPubkey', issuerPubkey, async () => (await this.duniterServer.dal.iindexDAL.query('SELECT wotb_id FROM i_index WHERE pub = ? AND wotb_id IS NOT NULL', [issuerPubkey]))[0].wotb_id)
  }

  @MonitorExecutionTime()
  getChainableOnByIssuerPubkey(issuerPubkey: string) {
    return this.query('SELECT `chainable_on` FROM c_index WHERE `issuer`=\''+issuerPubkey+'\' ORDER BY `chainable_on` DESC LIMIT 1')
  }

  @MonitorExecutionTime()
  getChainableOnByIssuerPubkeyByExpOn(from: string) {
    return this.getFromCacheOrDB('getChainableOnByIssuerPubkeyByExpOn', from, () => this.query('SELECT `chainable_on` FROM c_index WHERE `issuer`=\''+from+'\' ORDER BY `expires_on` DESC LIMIT 1'))
  }

  @MonitorExecutionTime()
  getCurrentBlockOrNull() {
    return this.duniterServer.dal.getCurrentBlockOrNull()
  }

  @MonitorExecutionTime()
  findCertsOfIssuer(pub: string, tmpOrder: string) {
    return this.getFromCacheOrDB('findCertsOfIssuer', [pub, tmpOrder].join('-'), () => this.query(
      'SELECT `receiver`,`written_on`,`expires_on` FROM c_index WHERE `issuer`=\''+pub+'\' ORDER BY `expires_on` '+tmpOrder))
  }

  @MonitorExecutionTime()
  findCertsOfReceiver(pub: any, tmpOrder: string) {
    return this.getFromCacheOrDB('findCertsOfReceiver', [pub, tmpOrder].join('-'), () => this.query(
      'SELECT `issuer`,`written_on`,`expires_on` FROM c_index WHERE `receiver`=\''+pub+'\' ORDER BY `expires_on` '+tmpOrder))
  }

  @MonitorExecutionTime()
  getProtagonist(pub: string) {
    return this.getFromCacheOrDB('getProtagonist', pub, () => this.query('SELECT `uid`,`wotb_id` FROM i_index WHERE `pub`=\''+pub+'\' LIMIT 1'))
  }

  @MonitorExecutionTime()
  getCertsPending(pub: string, tmpOrder: string) {
    return this.getFromCacheOrDB('getCertsPending', [pub, tmpOrder].join('-'), () => this.query(
      'SELECT `from`,`to`,`block_number`,`expires_on` FROM certifications_pending WHERE `from`=\''+pub+'\' ORDER BY `expires_on` '+tmpOrder))
  }

  @MonitorExecutionTime()
  getCertsPendingFromTo(pub: any, tmpOrder: string) {
    return this.getFromCacheOrDB('getCertsPendingFromTo', [pub, tmpOrder].join('-'), () => this.query(
      'SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\''+pub+'\' ORDER BY `expires_on` '+tmpOrder))
  }

  @MonitorExecutionTime()
  getMembers() {
    return this.getFromCacheOrDB('getMembers', 'members', () => this.query('SELECT `uid`,`pub`,`member`,`written_on`,`wotb_id` FROM i_index WHERE `member`=1'))
  }

  @MonitorExecutionTime()
  membershipWrittenOnExpiresOn(pub: string) {
    return this.getFromCacheOrDB('membershipWrittenOnExpiresOn', pub, () => this.query(
      'SELECT `written_on`,`expires_on` FROM m_index WHERE `pub`=\''+pub+'\' ORDER BY `expires_on` DESC LIMIT 1'))
  }

  @MonitorExecutionTime()
  query(sql: string, params?: any[]) {
    return this.duniterServer.dal.peerDAL.query(sql, params || [])
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
      () => this.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` > '+previousBlockchainTime+' ORDER BY `medianTime` ASC'))
  }

  @MonitorExecutionTime()
  getBlockWhereMedianTimeLteAndGt(medianTime: number, previousBlockchainTime: number) {
    return this.getFromCacheOrDB('getBlockWhereMedianTimeLteAndGt', [medianTime, previousBlockchainTime].join('-'),
      () => this.query('SELECT `issuer`,`membersCount`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` <= '+medianTime+' AND `medianTime` > '+previousBlockchainTime+' ORDER BY `medianTime` ASC'))
  }

  @MonitorExecutionTime()
  getBlockWhereMedianTimeLteAndGteNoLimit(endMedianTime: number, beginMedianTime: number) {
    return this.getFromCacheOrDB('getBlockWhereMedianTimeLteAndGteNoLimit', [endMedianTime, beginMedianTime].join('-'),
      () => this.query('SELECT `issuer`,`membersCount`,`monetaryMass`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` <= '+endMedianTime+' AND `medianTime` >= '+beginMedianTime+' ORDER BY `medianTime` ASC'))
  }

  @MonitorExecutionTime()
  getBlockWhereMedianTimeGtNoLimit(beginMedianTime: number) {
    return this.getFromCacheOrDB('getBlockWhereMedianTimeGtNoLimit', String(beginMedianTime),
      () => this.query('SELECT `issuer`,`membersCount`,`monetaryMass`,`medianTime`,`dividend`,`number`,`nonce` FROM block WHERE `fork`=0 AND `medianTime` >= '+beginMedianTime+' ORDER BY `medianTime` ASC'))
  }
}
