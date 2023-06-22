import * as fs from 'fs';
import { DATA_PATH } from './util/config';
import { AdaptedLedgerObject, SupplyInfoType } from './util/types';
import { AccountRoot, FeeSettings, Offer, SignerList } from 'xrpl/dist/npm/models/ledger';
import * as rippleAddressCodec from 'ripple-address-codec';

require("log-timestamp");

export class SupplyInfo {

    private static _instance: SupplyInfo;

    private supplyInfo: SupplyInfoType;

    private current_ledger_index: number;
    private current_ledger_date: string;

    blackholeAccounts = [
      'rrrrrrrrrrrrrrrrrrrrrhoLvTp',        // Account Zero
      'rrrrrrrrrrrrrrrrrrrrBZbvji',         // Account One
      'rrrrrrrrrrrrrrrrrrrn5RM1rHd',        // NaN
      'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'  // Genesis (blackholed)
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

    signer_lists: {
      [key: string]: SignerList
    } = {};

    xrpInEscrow: number = 0;
    number_of_offers: number = 0;

    feeSetting:FeeSettings = null;

    private constructor() { }

    public static get Instance(): SupplyInfo
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
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

            if(entry.LedgerEntryType === 'SignerList') {
              let listOwner = rippleAddressCodec.encodeAccountID(Buffer.from(entry.index, 'hex').slice(4, 24));

              this.signer_lists[listOwner] = entry;
            }

            if(entry.LedgerEntryType === 'Escrow') {
              this.xrpInEscrow = this.xrpInEscrow + Number(entry.Amount);
            }

            if(entry.LedgerEntryType === 'Offer') {
              this.number_of_offers++;
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
        let totalReservedForOffers = 0;
      

        for(let account in this.accounts) {
          if(this.accounts.hasOwnProperty(account)) {
            let accRoot = this.accounts[account];

            let spendableXrp = this.isAccountBlackHoled(accRoot) ? 0 : Number(accRoot.Balance);
            let reservedXrp = accountReserve + (accRoot.OwnerCount * ownerReserve);
            let reservedForOffers = (this.offers[accRoot.Account] || []).length * ownerReserve;

            let circulating = Math.max(spendableXrp - reservedXrp + reservedForOffers, 0)

            totalXrpInAccounts = totalXrpInAccounts + spendableXrp;
            //add spendable xrp to total xrp count
            if(circulating > 0) {
              circulatingXRP = circulatingXRP + circulatingXRP;
            }

            totalReservedXrp = totalReservedXrp + reservedXrp;
            totalReservedForOffers = totalReservedForOffers + reservedForOffers;

            numberOfAccounts++;
          }
        }


        this.supplyInfo = {
          ledger: this.getCurrentLedgerIndex(),
          closeTimeHuman: this.getCurrentLedgerCloseTime(),
          accounts: numberOfAccounts,
          xrpExisting: (totalXrpInAccounts + this.xrpInEscrow)/1000000,
          xrp: {
            xrpTotalSupply: circulatingXRP/1000000,
            xrpTotalBalance: totalXrpInAccounts/1000000,
            xrpTotalReserved: totalReservedXrp/1000000,
            xrpTotalReservedOffers: totalReservedForOffers/1000000
          }
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
    return (!accountRoot.RegularKey && this.isMasterKeyDisabled(accountRoot.Flags) && !this.signer_lists[accountRoot.Account]) || this.blackholeAccounts.includes(accountRoot.Account);
  }
}