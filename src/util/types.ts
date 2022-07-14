export interface Currency {
    token: string,
    balance: number
}

export interface IssuerAccount {
    issuer: string,
    tokens: Currency[]
}

export interface IssuerData {
    amount: number,
    trustlines: number,
    offers: number,
    holders:number
}
 
export interface IssuerVerification {
    resolvedBy: string,
    account: string,
    verified: boolean,
    kyc?: boolean,
    created?: string,
    domain?: string,
    username?: string,
    twitter?: string
}

export interface AdaptedLedgerObject {
    data: string,
    index: string,
    parsed: any
}

export interface IssuerTokenEntry {
    issuer: string,
    amount: number,
    trustlines: number,
    offers: number,
    holders: number
}

export interface IssuerTokenTableEntry {
    ledger_index: number,
    ledger_close: Date,
    ledger_close_ms: number,
    ledger_hash: string,
    issuers: IssuerTokenEntry[]
}

export interface LedgerDataEntry {
    type: string,
    count: number,
    size: number,
    percentrage: number,
    property_count: {
        [key: string]: number
    },
    flags?: {
        [key: string]: number,
    },
    special_data?: {
        [key: string]: number,
    }

}

export interface LedgerDataTableEntry {
    ledger_index: number,
    ledger_close: Date,
    ledger_close_ms: number,
    ledger_hash: string,
    ledger_size: number,
    size_type: "B"|"KB"|"MB"|"GB"|"TB",
    ledger_data: LedgerDataEntry[]
}

export interface TokenCreationTableEntry {
    token:string,
    date: Date,
    hash: string
}

export interface KycDataTableEntry {
    [account: string]: boolean,
}
