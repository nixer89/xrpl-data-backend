import LedgerEntry from "xrpl/dist/npm/models/ledger/LedgerEntry"

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

export interface NFTokenOffer {
    Amount: any,
    Flags: number,
    NFTokenID: string,
    Owner: string,
    OfferID: string,
    Destination: string,
    Expiration: number
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
    parsed: LedgerEntry
}

export interface SupplyInfoType {
    ledger: number,
    closeTimeHuman: string,
    accounts: number,
    xahExisting: number,
    xah: {
        xahTotalSupply: number,
        xahTotalBalance: number,
        xahTotalReserved: number,
        xahTotalTransientReserves: number
    },
    ledger_data: string
}

export interface URIToken {
    URITokenID: string,
    Owner: string,
    Issuer: string,
    URI: string,
    Digest?: string,
    Amount?: any,
    Destination?: string   
}
