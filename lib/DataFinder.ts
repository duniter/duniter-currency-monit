import {Server} from 'duniter/server'

export class DataFinder {

  private memCache: {
    [cacheName: string]: {
      [k: string]: any
    }
  } = {}

  constructor(protected duniterServer: Server) {
  }

  findPendingMembers() {
    return this.query('SELECT `buid`,`pubkey`,`uid`,`hash`,`expires_on`,`revocation_sig` FROM identities_pending WHERE `member`=0')
  }

  findPendingCertsToTarget(toPubkey: string, hash: string) {
    return this.getFromCacheOrDB('findPendingCertsToTarget', [toPubkey, hash].join('-'), () => this.query(
      'SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\''+toPubkey+'\' AND `target`=\''+hash+'\' ORDER BY `expires_on` DESC'))
  }

  getWotexInfos(uid: string) {
    return this.duniterServer.dal.idtyDAL.query('' +
      'SELECT hash, uid, pub, wotb_id FROM i_index WHERE uid = ? ' +
      'UNION ALL ' + 'SELECT hash, uid, pubkey as pub, (SELECT NULL) AS wotb_id FROM idty WHERE uid = ?', [uid, uid])
  }

  async getBlockMedianTimeAndHash(block_number: number): Promise<{ hash: string, medianTime: number }|undefined> {
    return (await this.getFromCacheOrDB('getBlockMedianTimeAndHash', String(block_number),() => this.duniterServer.dal.getBlock(block_number))) || undefined
  }

  getUidOfPub(pub: string): Promise<{ uid: string }[]> {
    return this.getFromCacheOrDB('getUidOfPub', pub, () => this.query('SELECT `uid` FROM i_index WHERE `pub`=\''+pub+'\' LIMIT 1'))
  }

  async getWotbIdByIssuerPubkey(issuerPubkey: string) {
    return this.getFromCacheOrDB('getWotbIdByIssuerPubkey', issuerPubkey, async () => (await this.duniterServer.dal.iindexDAL.query('SELECT wotb_id FROM i_index WHERE pub = ? AND wotb_id IS NOT NULL', [issuerPubkey]))[0].wotb_id)
  }

  getChainableOnByIssuerPubkey(issuerPubkey: string) {
    return this.query('SELECT `chainable_on` FROM c_index WHERE `issuer`=\''+issuerPubkey+'\' ORDER BY `chainable_on` DESC LIMIT 1')
  }

  getChainableOnByIssuerPubkeyByExpOn(from: string) {
    return this.getFromCacheOrDB('getChainableOnByIssuerPubkeyByExpOn', from, () => this.query('SELECT `chainable_on` FROM c_index WHERE `issuer`=\''+from+'\' ORDER BY `expires_on` DESC LIMIT 1'))
  }

  getCurrentBlockOrNull() {
    return this.duniterServer.dal.getCurrentBlockOrNull()
  }

  findCertsOfIssuer(pub: string, tmpOrder: string) {
    return this.getFromCacheOrDB('findCertsOfIssuer', [pub, tmpOrder].join('-'), () => this.query(
      'SELECT `receiver`,`written_on`,`expires_on` FROM c_index WHERE `issuer`=\''+pub+'\' ORDER BY `expires_on` '+tmpOrder))
  }

  findCertsOfReceiver(pub: any, tmpOrder: string) {
    return this.getFromCacheOrDB('findCertsOfReceiver', [pub, tmpOrder].join('-'), () => this.query(
      'SELECT `issuer`,`written_on`,`expires_on` FROM c_index WHERE `receiver`=\''+pub+'\' ORDER BY `expires_on` '+tmpOrder))
  }

  getProtagonist(pub: string) {
    return this.getFromCacheOrDB('getProtagonist', pub, () => this.query('SELECT `uid`,`wotb_id` FROM i_index WHERE `pub`=\''+pub+'\' LIMIT 1'))
  }

  getCertsPending(pub: string, tmpOrder: string) {
    return this.getFromCacheOrDB('getCertsPending', [pub, tmpOrder].join('-'), () => this.query(
      'SELECT `from`,`to`,`block_number`,`expires_on` FROM certifications_pending WHERE `from`=\''+pub+'\' ORDER BY `expires_on` '+tmpOrder))
  }

  getCertsPendingFromTo(pub: any, tmpOrder: string) {
    return this.getFromCacheOrDB('getCertsPendingFromTo', [pub, tmpOrder].join('-'), () => this.query(
      'SELECT `from`,`block_number`,`block_hash`,`expires_on` FROM certifications_pending WHERE `to`=\''+pub+'\' ORDER BY `expires_on` '+tmpOrder))
  }

  getMembers() {
    return this.getFromCacheOrDB('getMembers', 'members', () => this.query('SELECT `uid`,`pub`,`member`,`written_on`,`wotb_id` FROM i_index WHERE `member`=1'))
  }

  membershipWrittenOnExpiresOn(pub: string) {
    return this.getFromCacheOrDB('membershipWrittenOnExpiresOn', pub, () => this.query(
      'SELECT `written_on`,`expires_on` FROM m_index WHERE `pub`=\''+pub+'\' ORDER BY `expires_on` DESC LIMIT 1'))
  }

  query(sql: string, params?: any[]) {
    return this.duniterServer.dal.peerDAL.query(sql, params || [])
  }

  async getFromCacheOrDB<T>(cacheName: string, key: string, fetcher: () => Promise<T>) {
    const cache = this.memCache[cacheName] || (this.memCache[cacheName] = {})
    if (cache[key]) {
      return cache[key]
    }
    return cache[key] = await fetcher()
  }

  invalidateCache() {
    this.memCache = {}
  }
}
