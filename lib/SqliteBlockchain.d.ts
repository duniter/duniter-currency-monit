import { SqliteTable } from "duniter/app/lib/dal/indexDAL/sqlite/SqliteTable";
import { SQLiteDriver } from "duniter/app/lib/dal/drivers/SQLiteDriver";
import { DBBlock } from "duniter/app/lib/db/DBBlock";
export declare class SqliteBlockchain extends SqliteTable<MonitDBBlock> {
    constructor(getSqliteDB: (dbName: string) => Promise<SQLiteDriver>);
    insertBatch(records: MonitDBBlock[]): Promise<void>;
    query(sql: string, params?: any[]): Promise<any>;
    getBlock(number: number): Promise<MonitDBBlock | null>;
    getHighestBlock(): Promise<MonitDBBlock | null>;
    getHighestBlockNumber(): Promise<number>;
    getHighestArchivedBlockNumber(): Promise<number>;
    trimNonArchived(): Promise<void>;
    setArchived(currentCeil: number): Promise<void>;
    deleteAll(): Promise<void>;
}
export interface MonitDBBlock extends DBBlock {
    archived: boolean;
}
