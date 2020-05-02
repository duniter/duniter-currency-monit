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
const SqliteTable_1 = require("duniter/app/lib/dal/indexDAL/sqlite/SqliteTable");
const SqlFieldDefinition_1 = require("duniter/app/lib/dal/indexDAL/sqlite/SqlFieldDefinition");
const MonitorExecutionTime_1 = require("./MonitorExecutionTime");
class SqliteBlockchain extends SqliteTable_1.SqliteTable {
    constructor(getSqliteDB) {
        super('monit', {
            'archived': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('BOOLEAN', true),
            'fork': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('BOOLEAN', true),
            'hash': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('VARCHAR', false, 64),
            'inner_hash': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('VARCHAR', false, 64),
            'signature': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('VARCHAR', false, 100),
            'currency': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('VARCHAR', false, 50),
            'issuer': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('VARCHAR', false, 50),
            'version': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('INT', false),
            'membersCount': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('INT', false),
            'medianTime': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('INT', true),
            'time': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('INT', false),
            'powMin': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('INT', false),
            'number': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('INT', false),
            'nonce': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('INT', false),
            'issuersCount': new SqlFieldDefinition_1.SqlNotNullableFieldDefinition('INT', false),
            'parameters': new SqlFieldDefinition_1.SqlNullableFieldDefinition('VARCHAR', false, 255),
            'previousHash': new SqlFieldDefinition_1.SqlNullableFieldDefinition('VARCHAR', false, 64),
            'previousIssuer': new SqlFieldDefinition_1.SqlNullableFieldDefinition('VARCHAR', false, 50),
            'monetaryMass': new SqlFieldDefinition_1.SqlNullableFieldDefinition('VARCHAR', false, 100),
            'UDTime': new SqlFieldDefinition_1.SqlNullableFieldDefinition('INT', false),
            'dividend': new SqlFieldDefinition_1.SqlNullableFieldDefinition('INT', false),
            'unitbase': new SqlFieldDefinition_1.SqlNullableFieldDefinition('INT', false),
            'transactions': new SqlFieldDefinition_1.SqlNullableFieldDefinition('TEXT', false),
            'certifications': new SqlFieldDefinition_1.SqlNullableFieldDefinition('TEXT', false),
            'identities': new SqlFieldDefinition_1.SqlNullableFieldDefinition('TEXT', false),
            'joiners': new SqlFieldDefinition_1.SqlNullableFieldDefinition('TEXT', false),
            'actives': new SqlFieldDefinition_1.SqlNullableFieldDefinition('TEXT', false),
            'leavers': new SqlFieldDefinition_1.SqlNullableFieldDefinition('TEXT', false),
            'revoked': new SqlFieldDefinition_1.SqlNullableFieldDefinition('TEXT', false),
            'excluded': new SqlFieldDefinition_1.SqlNullableFieldDefinition('TEXT', false),
        }, getSqliteDB);
        this.name = 'block';
    }
    insertBatch(records) {
        return __awaiter(this, void 0, void 0, function* () {
            records.forEach((b) => {
                for (const prop of ['joiners', 'actives', 'leavers', 'identities', 'certifications', 'transactions', 'revoked', 'excluded']) {
                    b[prop] = JSON.stringify(b[prop]);
                }
                return b;
            });
            if (records.length) {
                return this.insertBatchInTable(this.driver, records);
            }
        });
    }
    query(sql, params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.driver.sqlRead(sql, params || []);
        });
    }
    getBlock(number) {
        return __awaiter(this, void 0, void 0, function* () {
            const blocks = yield this.driver.sqlRead('SELECT * FROM block WHERE number = ?', [number]);
            return blocks.length ? blocks[0] : null;
        });
    }
    getHighestBlock() {
        return __awaiter(this, void 0, void 0, function* () {
            const blocks = yield this.driver.sqlRead('SELECT * FROM block ORDER BY number DESC LIMIT 1', []);
            return blocks.length ? blocks[0] : null;
        });
    }
    getHighestBlockNumber() {
        return __awaiter(this, void 0, void 0, function* () {
            const block = yield this.getHighestBlock();
            return block && block.number || -1;
        });
    }
    getHighestArchivedBlockNumber() {
        return __awaiter(this, void 0, void 0, function* () {
            const block = yield this.driver.sqlRead('SELECT * FROM block WHERE archived ORDER BY number DESC LIMIT 1', []);
            return block.length && block[0].number || -1;
        });
    }
    trimNonArchived() {
        return this.driver.sqlWrite('DELETE FROM block WHERE NOT archived', []);
    }
    setArchived(currentCeil) {
        return this.driver.sqlWrite('UPDATE block SET archived = ? WHERE number <= ? AND NOT archived', [true, currentCeil]);
    }
    deleteAll() {
        return this.driver.sqlWrite('DELETE FROM block', []);
    }
}
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], SqliteBlockchain.prototype, "insertBatch", null);
__decorate([
    MonitorExecutionTime_1.MonitorExecutionTime()
], SqliteBlockchain.prototype, "query", null);
exports.SqliteBlockchain = SqliteBlockchain;
//# sourceMappingURL=SqliteBlockchain.js.map