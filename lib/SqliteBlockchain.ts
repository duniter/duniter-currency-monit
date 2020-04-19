import {SqliteTable} from "duniter/app/lib/dal/indexDAL/sqlite/SqliteTable";
import {SQLiteDriver} from "duniter/app/lib/dal/drivers/SQLiteDriver";
import {
  SqlNotNullableFieldDefinition,
  SqlNullableFieldDefinition
} from "duniter/app/lib/dal/indexDAL/sqlite/SqlFieldDefinition";
import {MonitorExecutionTime} from "./MonitorExecutionTime";
import {DBBlock} from "duniter/app/lib/db/DBBlock";

export class SqliteBlockchain extends SqliteTable<MonitDBBlock> {

  constructor(getSqliteDB: (dbName: string)=> Promise<SQLiteDriver>) {
    super(
      'monit',
      {
        'archived':       new SqlNotNullableFieldDefinition('BOOLEAN', true),
        'fork':           new SqlNotNullableFieldDefinition('BOOLEAN', true),
        'hash':           new SqlNotNullableFieldDefinition('VARCHAR', false, 64),
        'inner_hash':     new SqlNotNullableFieldDefinition('VARCHAR', false, 64),
        'signature':      new SqlNotNullableFieldDefinition('VARCHAR', false, 100),
        'currency':       new SqlNotNullableFieldDefinition('VARCHAR', false, 50),
        'issuer':         new SqlNotNullableFieldDefinition('VARCHAR', false, 50),
        'version':        new SqlNotNullableFieldDefinition('INT', false),
        'membersCount':   new SqlNotNullableFieldDefinition('INT', false),
        'medianTime':     new SqlNotNullableFieldDefinition('INT', true), // DATETIME?
        'time':           new SqlNotNullableFieldDefinition('INT', false), // DATETIME?
        'powMin':         new SqlNotNullableFieldDefinition('INT', false),
        'number':         new SqlNotNullableFieldDefinition('INT', false),
        'nonce':          new SqlNotNullableFieldDefinition('INT', false),
        'issuersCount':   new SqlNotNullableFieldDefinition('INT', false),
        'parameters':     new SqlNullableFieldDefinition('VARCHAR', false, 255),
        'previousHash':   new SqlNullableFieldDefinition('VARCHAR', false, 64),
        'previousIssuer': new SqlNullableFieldDefinition('VARCHAR', false, 50),
        'monetaryMass':   new SqlNullableFieldDefinition('VARCHAR', false, 100),
        'UDTime':         new SqlNullableFieldDefinition('INT', false), // DATETIME
        'dividend':       new SqlNullableFieldDefinition('INT', false), // DEFAULT \'0\'
        'unitbase':       new SqlNullableFieldDefinition('INT', false),
        'transactions':   new SqlNullableFieldDefinition('TEXT', false),
        'certifications': new SqlNullableFieldDefinition('TEXT', false),
        'identities':     new SqlNullableFieldDefinition('TEXT', false),
        'joiners':        new SqlNullableFieldDefinition('TEXT', false),
        'actives':        new SqlNullableFieldDefinition('TEXT', false),
        'leavers':        new SqlNullableFieldDefinition('TEXT', false),
        'revoked':        new SqlNullableFieldDefinition('TEXT', false),
        'excluded':       new SqlNullableFieldDefinition('TEXT', false),
      },
      getSqliteDB
    );
    this.name = 'block'
  }

  @MonitorExecutionTime()
  async insertBatch(records: MonitDBBlock[]): Promise<void> {
    records.forEach((b:any) => {
      for (const prop of ['joiners', 'actives', 'leavers', 'identities', 'certifications', 'transactions', 'revoked', 'excluded']) {
        b[prop] = JSON.stringify(b[prop]);
      }
      return b
    });
    if (records.length) {
      return this.insertBatchInTable(this.driver, records)
    }
  }

  @MonitorExecutionTime()
  async query(sql: string, params?: any[]): Promise<any> {
    return this.driver.sqlRead(sql, params || [])
  }

  async getBlock(number: number): Promise<MonitDBBlock|null> {
    const blocks = await this.driver.sqlRead('SELECT * FROM block WHERE number = ?', [number])
    return blocks.length ? blocks[0] : null
  }

  async getHighestBlock(): Promise<MonitDBBlock|null> {
    const blocks = await this.driver.sqlRead('SELECT * FROM block ORDER BY number DESC LIMIT 1', [])
    return blocks.length ? blocks[0] : null
  }

  async getHighestBlockNumber(): Promise<number> {
    const block = await this.getHighestBlock()
    return block && block.number || -1
  }

  async getHighestArchivedBlockNumber(): Promise<number> {
    const block = await this.driver.sqlRead('SELECT * FROM block WHERE archived ORDER BY number DESC LIMIT 1', [])
    return block.length && block[0].number || -1
  }

  trimNonArchived() {
    return this.driver.sqlWrite('DELETE FROM block WHERE NOT archived', [])
  }

  setArchived(currentCeil: number) {
    return this.driver.sqlWrite('UPDATE block SET archived = ? WHERE number <= ? AND NOT archived', [true, currentCeil])
  }

  deleteAll() {
    return this.driver.sqlWrite('DELETE FROM block', [])
  }
}

export interface MonitDBBlock extends DBBlock {
  archived: boolean
}
