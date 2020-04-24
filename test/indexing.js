"use strict";
// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
Object.defineProperty(exports, "__esModule", { value: true });
const test_framework_1 = require("duniter/test/integration/tools/test-framework");
const constants_1 = require("duniter/app/lib/common-libs/constants");
const DataFinder_1 = require("../lib/DataFinder");
describe('Indexing blockchain', () => test_framework_1.writeBasicTestWithConfAnd2Users({
    sigQty: 1,
    medianTimeBlocks: 1,
    forksize: 2,
}, (test) => {
    const now = 1500000000;
    before(() => {
        constants_1.CommonConstants.BLOCKS_IN_MEMORY_MAX = 3; // Must be > forkWindowSize
    });
    test('Duniter blockchain init', async (s1, cat, tac) => {
        await cat.createIdentity();
        await tac.createIdentity();
        await cat.cert(tac);
        await tac.cert(cat);
        await cat.join();
        await tac.join();
        for (let i = 0; i < 6; i++) {
            await s1.commit({ time: now });
        }
        const head = await s1.commit({ time: now });
        test_framework_1.assertEqual(head.number, 6);
        s1.dal.blockchainArchiveDAL._chunkSize = 2; // Archive 2 blocks per file
    });
    test('first indexing by monit', async (s1) => {
        // Simulate that archiving was called on Duniter once (during sync)
        await s1.dal.archiveBlocks();
        // Now test Monit
        await DataFinder_1.initMonitDB(s1._server, true);
        test_framework_1.assertEqual(await DataFinder_1.DataFinder.getInstance().getHighestBlockNumber(), 6); // Current block in Monit = current in Duniter
        test_framework_1.assertEqual(await DataFinder_1.DataFinder.getInstance().getHighestArchivedBlockNumber(), 4); // Highest archived = current - forksize
    });
    test('second indexing by monit after adding some blocks to the blockchain', async (s1) => {
        for (let i = 0; i < 3; i++) {
            await s1.commit({ time: now });
        }
        // Now test Monit
        await DataFinder_1.DataFinder.getInstance().index();
        test_framework_1.assertEqual(await DataFinder_1.DataFinder.getInstance().getHighestBlockNumber(), 9);
        test_framework_1.assertEqual(await DataFinder_1.DataFinder.getInstance().getHighestArchivedBlockNumber(), 7);
    });
    test('third indexing taking care of forks', async (s1) => {
        // Make a #10 block
        const b10v1Duniter = await s1.commit({ time: now });
        await DataFinder_1.DataFinder.getInstance().index();
        const b10v1Monit = await DataFinder_1.DataFinder.getInstance().getHighestBlock();
        test_framework_1.assertEqual(await DataFinder_1.DataFinder.getInstance().getHighestBlockNumber(), 10);
        test_framework_1.assertEqual(b10v1Monit.number, 10);
        test_framework_1.assertEqual(b10v1Monit.hash, b10v1Duniter.hash);
        test_framework_1.assertEqual(await DataFinder_1.DataFinder.getInstance().getHighestArchivedBlockNumber(), 8); // Archived level = 10 - forksize
        // Revert
        await s1.revert();
        // Re-commit
        const b10v2Duniter = await s1.commit({ time: now + 1 });
        await DataFinder_1.DataFinder.getInstance().index();
        const b10v2Monit = await DataFinder_1.DataFinder.getInstance().getHighestBlock();
        test_framework_1.assertEqual(await DataFinder_1.DataFinder.getInstance().getHighestBlockNumber(), 10);
        test_framework_1.assertEqual(b10v2Monit.number, 10);
        test_framework_1.assertEqual(b10v2Monit.hash, b10v2Duniter.hash);
        test_framework_1.assertEqual(await DataFinder_1.DataFinder.getInstance().getHighestArchivedBlockNumber(), 8); // Archived level = 10 - forksize
        // assertions
        test_framework_1.assertTrue(b10v1Duniter.number === b10v2Duniter.number);
        test_framework_1.assertTrue(b10v1Duniter.hash !== b10v2Duniter.hash);
        test_framework_1.assertTrue(b10v1Monit.number === b10v2Monit.number);
        test_framework_1.assertTrue(b10v1Monit.hash !== b10v2Monit.hash);
        test_framework_1.assertTrue(b10v1Monit.hash === b10v1Duniter.hash);
        test_framework_1.assertTrue(b10v2Monit.hash === b10v2Duniter.hash);
    });
}));
//# sourceMappingURL=indexing.js.map