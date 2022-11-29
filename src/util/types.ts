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

export interface NFT {
    NFTokenID: string,
    TransferFee: number,
    Issuer: string,
    Owner: string,
    Taxon: number,
    Sequence: number,
    URI: string,
    Flags?: number
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
