import * as fs from 'fs';
import { DATA_PATH } from './util/config';
import { AdaptedLedgerObject, SupplyInfoType } from './util/types';
import { AccountRoot, FeeSettings, Offer, SignerList } from 'xrpl/dist/npm/models/ledger';
import * as rippleAddressCodec from 'ripple-address-codec';
import { createHash } from 'crypto';
import { LedgerData } from './ledgerData';

require("log-timestamp");

export class SupplyInfo {

    private static _instance: SupplyInfo;

    private ledgerData:LedgerData;
    private supplyInfo: SupplyInfoType;

    private current_ledger_index: number;
    private current_ledger_date: string;

    blackholeAccounts = [
      'rrrrrrrrrrrrrrrrrrrrrhoLvTp',        // Account Zero
      'rrrrrrrrrrrrrrrrrrrrBZbvji',         // Account One
      'rrrrrrrrrrrrrrrrrrrn5RM1rHd',        // NaN
    ]

    FLAG_65536:number = 65536;
    FLAG_131072:number = 131072;
    FLAG_262144:number = 262144;
    FLAG_524288:number = 524288;
    FLAG_1048576:number = 1048576;
    FLAG_2097152:number = 2097152;
    FLAG_4194304:number = 4194304;
    FLAG_8388608:number = 8388608;
    FLAG_16777216:number = 16777216;

    FLAG_SELL_NFT:number = 0x00000001;

    accounts: {
      [key: string]: AccountRoot
    } = {};

    offers: {
      [key: string]: Offer[]
    } = {};

    nft_offers: {
      [key: string]: any[]
    } = {};

    signer_lists: {
      [key: string]: SignerList
    } = {};

    xrpLockedInObjects:number = 0;

    feeSetting:FeeSettings = null;

    private constructor() { }

    public static get Instance(): SupplyInfo
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public init() {
      this.ledgerData = LedgerData.Instance;
    }

    public async collectSupplyInfo(ledgerState:any): Promise<void> {

        for(let i = 0; i < ledgerState.length; i++) {
            let ledgerObject:AdaptedLedgerObject = ledgerState[i];

            let entry = ledgerObject.parsed;

            if(entry.LedgerEntryType === 'AccountRoot') {
              this.accounts[entry.Account] = entry;
            }

            if(entry.LedgerEntryType === 'Offer') {
              if(!this.offers[entry.Account]) {
                this.offers[entry.Account] = [entry];
              } else {
                this.offers[entry.Account].push(entry);
              }
            }

            if((entry as any).LedgerEntryType === 'NFTokenOffer') {
              let nftOffer:any = entry;
              if(!this.nft_offers[nftOffer.Account]) {
                this.nft_offers[nftOffer.Account] = [entry];
              } else {
                this.nft_offers[nftOffer.Account].push(entry);
              }
            }

            if(entry.LedgerEntryType === 'SignerList') {
              this.signer_lists[entry.index] = entry;
            }

            if(entry.LedgerEntryType === 'Escrow') {
              this.xrpLockedInObjects = this.xrpLockedInObjects + Number(entry.Amount);
            }

            if(entry.LedgerEntryType === 'PayChannel') {
              this.xrpLockedInObjects = this.xrpLockedInObjects + (Number(entry.Amount) - Number(entry.Balance));
            }

            if(entry.LedgerEntryType === 'FeeSettings') {
              this.feeSetting = entry;
            }
        }
    }

    public async calculateSupplyAndSave(): Promise<void> {

      try {

        let accountReserve = this.feeSetting.ReserveBase;
        let ownerReserve = this.feeSetting.ReserveIncrement;

        let totalXrpInAccounts = 0;
        let circulatingXRP = 0;
        let numberOfAccounts = 0;
        let totalReservedXrp = 0;
        let totalTransientReserves = 0;
      

        for(let account in this.accounts) {
          if(this.accounts.hasOwnProperty(account)) {
            let accRoot = this.accounts[account];

            let spendableAccountBalance = this.isAccountBlackHoled(accRoot) ? 0 : Number(accRoot.Balance);
            let reservedXrp = accountReserve + (accRoot.OwnerCount * ownerReserve);
            let transientReserve = ((this.offers[accRoot.Account] || []).length + (this.nft_offers[accRoot.Account] || []).length) * ownerReserve;

            let xrpThatCanCirculate = Math.max(spendableAccountBalance - reservedXrp + transientReserve, 0)

            totalXrpInAccounts = totalXrpInAccounts + Number(accRoot.Balance);
            //add spendable xrp to total xrp count
            if(xrpThatCanCirculate > 0) {
              circulatingXRP = circulatingXRP + xrpThatCanCirculate;
            }

            totalReservedXrp = totalReservedXrp + reservedXrp;
            totalTransientReserves = totalTransientReserves + transientReserve;

            numberOfAccounts++;
          }
        }

        let ledger_data:any = this.ledgerData.getLedgerData();

        if(ledger_data.ledger_index != this.getCurrentLedgerIndex) {
          //something is wrong. null ledger data coz it does not match!
          console.log("MISMATCH OF LEDGER INDEXES:")
          console.log("ledger_data.ledger_index: " + ledger_data.ledger_index);
          console.log("this.getCurrentLedgerIndex: " + this.getCurrentLedgerIndex);

          ledger_data = null;
        }


        this.supplyInfo = {
          ledger: this.getCurrentLedgerIndex(),
          closeTimeHuman: this.getCurrentLedgerCloseTime(),
          accounts: numberOfAccounts,
          xrpExisting: (totalXrpInAccounts + this.xrpLockedInObjects)/1000000,
          xrp: {
            xrpTotalSupply: circulatingXRP/1000000,
            xrpTotalBalance: totalXrpInAccounts/1000000,
            xrpTotalReserved: totalReservedXrp/1000000,
            xrpTotalTransientReserves: totalTransientReserves/1000000
          },
          ledger_data: JSON.stringify(ledger_data)
        }

        await this.saveSupplyInfoToFS();
      } catch(err) {
        console.log(err);
      }
    }

    public getSupplyInfo() {
      return this.supplyInfo;
    }

    public clearSupplyInfo() {
      this.supplyInfo = null;
      this.xrpLockedInObjects = 0;
      this.feeSetting = null;
      this.accounts = {};
      this.offers = {};
      this.nft_offers = {};
      this.signer_lists = {};
      
    }

    public async saveSupplyInfoToFS(): Promise<void> {
        let supplyInfoToSave:string = JSON.stringify(this.supplyInfo);
        if(supplyInfoToSave && supplyInfoToSave.length > 0) {

            fs.writeFileSync(DATA_PATH+"supplyInfo.js", supplyInfoToSave);

            console.log("saved supply info to file system");
        } else {
          console.log("supply info is empty! Nothing saved");
        }
    }

    public getCurrentLedgerIndex(): number {
      return this.current_ledger_index;
    }

    public setCurrentLedgerIndex(index:number): void {
        this.current_ledger_index = index;
    }

    public getCurrentLedgerCloseTime(): string {
        return this.current_ledger_date;
    }

    public setCurrentLedgerCloseTime(closeTime: string): void {
        this.current_ledger_date = closeTime;
    }

  isDefaultRippleEnabled(flags:number) {
      return flags && (flags & this.FLAG_8388608) == this.FLAG_8388608;
  }

  isDepositAuthEnabled(flags:number) {
    return flags && (flags & this.FLAG_16777216) == this.FLAG_16777216;
  }

  isMasterKeyDisabled(flags:number) {
    return flags && (flags & this.FLAG_1048576) == this.FLAG_1048576;
  }

  isDisallowXRPEnabled(flags:number) {
    return flags && (flags & this.FLAG_524288) == this.FLAG_524288;
  }

  isGlobalFreezeEnabled(flags:number) {
    return flags && (flags & this.FLAG_4194304) == this.FLAG_4194304;
  }

  isNoFreezeEnabled(flags:number) {
    return flags && (flags & this.FLAG_2097152) == this.FLAG_2097152;
  }
  
  isPasswordSpentEnabled(flags:number) {
    return flags && (flags & this.FLAG_65536) == this.FLAG_65536;
  }

  isRequireAuthEnabled(flags:number) {
    return flags && (flags & this.FLAG_262144) == this.FLAG_262144;
  }

  isRequireDestinationTagEnabled(flags:number) {
      return flags && (flags & this.FLAG_131072) == this.FLAG_131072;
  }  

  isOfferFlagPassive(flags:number) {
    return flags && (flags & this.FLAG_65536) == this.FLAG_65536;
  }

  isOfferFlagSell(flags:number) {
    return flags && (flags & this.FLAG_131072) == this.FLAG_131072;
  }

  isSignerListFlagOneOwnerCount(flags:number) {
    return flags && (flags & this.FLAG_65536) == this.FLAG_65536;
  }

  isRippleStateFlagLowReserve(flags:number) {
    return flags && (flags & this.FLAG_65536) == this.FLAG_65536;
  }

  isRippleStateFlagHighReserve(flags:number) {
    return flags && (flags & this.FLAG_131072) == this.FLAG_131072;
  }

  isRippleStateFlagLowAuth(flags:number) {
    return flags && (flags & this.FLAG_262144) == this.FLAG_262144;
  }

  isRippleStateFlagHighAuth(flags:number) {
    return flags && (flags & this.FLAG_524288) == this.FLAG_524288;
  }

  isRippleStateFlagLowNoRipple(flags:number) {
    return flags && (flags & this.FLAG_1048576) == this.FLAG_1048576;
  }

  isRippleStateFlagHighNoRipple(flags:number) {
    return flags && (flags & this.FLAG_2097152) == this.FLAG_2097152;
  }

  isRippleStateFlagLowFreeze(flags:number) {
    return flags && (flags & this.FLAG_4194304) == this.FLAG_4194304;
  }

  isRippleStateFlagHighFreeze(flags:number) {
    return flags && (flags & this.FLAG_8388608) == this.FLAG_8388608;
  }

  isNFTokenOfferFlagSell(flags:number) {
    return flags && (flags & this.FLAG_SELL_NFT) == this.FLAG_SELL_NFT;
  }

  isAccountBlackHoled(accountRoot: AccountRoot): boolean {
    let signerListHash = this.createSignerListHash(accountRoot.Account);

    //known blackhole accounts
    if(this.blackholeAccounts.includes(accountRoot.Account)) {
      return true;
    }
    
    //if master key disabled, no regular key set and no signer list -> black holed
    if(this.isMasterKeyDisabled(accountRoot.Flags) && !accountRoot.RegularKey && !this.signer_lists[signerListHash]) {
      return true;
    }

    //it has one signing option then it is not blackholed!
    return false;
  }

  createSignerListHash(address:string): string {
    let spaceKeyHex = "0053";
    let accountHex = Buffer.from(rippleAddressCodec.decodeAccountID(address)).toString('hex')
    let sequenceHex = "00000000";

    let hash = createHash('sha512').update(Buffer.from(spaceKeyHex+accountHex+sequenceHex, 'hex')).digest('hex').toUpperCase().slice(0, 64);

    return hash;
  }
}