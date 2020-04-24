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
const will_members_1 = require("../modules/will-members");
describe('willMembers', () => test_framework_1.writeBasicTestWithConfAnd2Users({
    sigQty: 1,
    medianTimeBlocks: 1,
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
        const head = await s1.commit({ time: now });
        test_framework_1.assertEqual(head.number, 0);
        test_framework_1.assertEqual(head.membersCount, 2);
        await DataFinder_1.initMonitDB(s1._server);
    });
    test('toc tries to join', async (s1, cat, tac, toc) => {
        await toc.createIdentity();
        await toc.join();
        await cat.cert(toc);
        await tac.cert(toc);
        const will = await will_members_1.willMembers(s1._server);
        test_framework_1.assertEqual(will.idtysListOrdered.length, 1);
        test_framework_1.assertEqual(will.idtysListOrdered[0].pendingCertifications.length, 2); // cat & tac
    });
}));
//# sourceMappingURL=will-members.js.map