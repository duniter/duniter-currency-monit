import { DBMembership } from "duniter/app/lib/dal/sqliteDAL/MembershipDAL";
import { Server } from "duniter/server";
export declare function willMembers(duniterServer: Server, days?: number, order?: string, sort_by?: string, showIdtyWithZeroCert?: string, sortSig?: string): Promise<{
    days: number;
    order: string;
    sort_by: string;
    showIdtyWithZeroCert: string;
    sortSig: string;
    idtysListOrdered: WillMemberIdentityWithPendingCerts[];
    currentBlockNumber: any;
    currentBlockchainTimestamp: any;
    currentMembersCount: any;
    limitTimestamp: any;
    dSen: number;
    conf: import("duniter/app/lib/dto/ConfDTO").ConfDTO;
    nbMaxCertifs: number;
    countMembersWithSigQtyValidCert: number;
    meanSentriesReachedByIdtyPerCert: number[];
    meanMembersReachedByIdtyPerCert: number[];
    membersQualityExt: {
        [k: string]: string;
    };
}>;
interface PendingCert {
    from: string;
    pubkey?: string;
    wotb_id: number;
    issuerIsSentry: boolean;
    blockNumber: number;
    creationTimestamp: number;
    timestampExpire: number;
    timestampWritable: number;
    validBlockStamp: boolean;
}
interface DetailedDistance {
    nbSuccess: number;
    nbSentries: number;
    nbReached: number;
    isOutdistanced: boolean;
}
interface WillMemberIdentity {
    BlockNumber: number;
    creationTimestamp: number;
    pubkey: string;
    uid: string;
    hash?: string;
    wotexId: string;
    expires_on: number;
    nbCert: number;
    nbValidPendingCert: number;
    registrationAvailability: number;
    detailedDistance?: DetailedDistance;
    pendingCertifications?: PendingCert[];
    validBlockStamp: boolean;
    idtyRevoked: boolean;
    percentSentriesReached?: number;
    percentMembersReached?: number;
    membership?: DBMembership | null;
}
interface WillMemberIdentityWithPendingCerts extends WillMemberIdentity {
    pendingCertifications: PendingCert[];
}
export {};
