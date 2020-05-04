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

import {assertEqual, assertTrue, writeBasicTestWithConfAnd2Users} from "duniter/test/integration/tools/test-framework"
import {CommonConstants} from "duniter/app/lib/common-libs/constants";
import {DataFinder, initMonitDB} from "../lib/DataFinder";
import {MonitDBBlock} from "../lib/SqliteBlockchain";

describe('Indexing blockchain', () => writeBasicTestWithConfAnd2Users({
  sigQty: 1,
  medianTimeBlocks: 1,
  forksize: 2,
}, (test) => {

  const now = 1500000000

  before(() => {
    CommonConstants.BLOCKS_IN_MEMORY_MAX = 3 // Must be > forkWindowSize
  })

  test('Duniter blockchain init', async (s1, cat, tac) => {
    await cat.createIdentity()
    await tac.createIdentity()
    await cat.cert(tac)
    await tac.cert(cat)
    await cat.join()
    await tac.join()
    for (let i = 0; i < 6; i++) {
      await s1.commit({ time: now })
    }
    const head = await s1.commit({ time: now })
    assertEqual(head.number, 6);
    (s1.dal.blockchainArchiveDAL as any)._chunkSize = 2 // Archive 2 blocks per file
  })

  test('first indexing by monit', async (s1) => {
    // Simulate that archiving was called on Duniter once (during sync)
    await s1.dal.archiveBlocks()
    // Now test Monit
    await initMonitDB(s1._server, true)
    assertEqual(await DataFinder.getInstance().getHighestBlockNumber(), 6) // Current block in Monit = current in Duniter
    assertEqual(await DataFinder.getInstance().getHighestArchivedBlockNumber(), 4) // Highest archived = current - forksize
  })

  test('second indexing by monit after adding some blocks to the blockchain', async (s1) => {
    for (let i = 0; i < 3; i++) {
      await s1.commit({ time: now })
    }
    // Now test Monit
    await DataFinder.getInstance().index()
    assertEqual(await DataFinder.getInstance().getHighestBlockNumber(), 9)
    assertEqual(await DataFinder.getInstance().getHighestArchivedBlockNumber(), 7)
  })

  test('third indexing taking care of forks', async (s1) => {

    // Make a #10 block
    const b10v1Duniter = await s1.commit({ time: now })
    await DataFinder.getInstance().index()
    const b10v1Monit = await DataFinder.getInstance().getHighestBlock() as MonitDBBlock
    assertEqual(await DataFinder.getInstance().getHighestBlockNumber(), 10)
    assertEqual(b10v1Monit.number, 10)
    assertEqual(b10v1Monit.hash, b10v1Duniter.hash)
    assertEqual(await DataFinder.getInstance().getHighestArchivedBlockNumber(), 8) // Archived level = 10 - forksize

    // Revert
    await s1.revert()

    // Re-commit
    const b10v2Duniter = await s1.commit({ time: now + 1 })
    await DataFinder.getInstance().index()
    const b10v2Monit = await DataFinder.getInstance().getHighestBlock() as MonitDBBlock
    assertEqual(await DataFinder.getInstance().getHighestBlockNumber(), 10)
    assertEqual(b10v2Monit.number, 10)
    assertEqual(b10v2Monit.hash, b10v2Duniter.hash)
    assertEqual(await DataFinder.getInstance().getHighestArchivedBlockNumber(), 8) // Archived level = 10 - forksize

    // assertions
    assertTrue(b10v1Duniter.number === b10v2Duniter.number)
    assertTrue(b10v1Duniter.hash !== b10v2Duniter.hash)
    assertTrue(b10v1Monit.number === b10v2Monit.number)
    assertTrue(b10v1Monit.hash !== b10v2Monit.hash)
    assertTrue(b10v1Monit.hash === b10v1Duniter.hash)
    assertTrue(b10v2Monit.hash === b10v2Duniter.hash)
  })
}))

