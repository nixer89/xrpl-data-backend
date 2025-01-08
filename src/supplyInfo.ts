import * as fs from 'fs';
import { DATA_PATH } from './util/config';
import { AdaptedLedgerObject, SupplyInfoType } from './util/types';
import * as rippleAddressCodec from '@transia/ripple-address-codec';
import { createHash } from 'crypto';
import { LedgerData } from './ledgerData';
import { LedgerEntry, AccountRoot, FeeSettings, HookDefinition, Offer, SignerList } from '@transia/xrpl/dist/npm/models/ledger';

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

    TREASURY_HOOK_HASH_1 = '11B6F1534186086EF95E297F64806D8E4231865EE9871A0C438EA8A51BE20BD8';
    TREASURY_HOOK_HASH_2 = 'B55839E8CABBDE2501249C0F7B4BFD58FC25838AC79D6822594076804EABBE60';

    accounts: {
      [key: string]: AccountRoot
    } = {};

    treasuryAccounts: string[] = [];

    hookDefinitions_2: {
      [key: string]: HookDefinition[]
    } = {};

    offers: {
      [key: string]: Offer[]
    } = {};

    signer_lists: {
      [key: string]: SignerList
    } = {};

    lockedInEscrows:number = 0;
    lockedInPaychans:number = 0;

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

            let entry:LedgerEntry = ledgerObject.parsed;

            if(entry.LedgerEntryType === 'AccountRoot') {
              this.accounts[entry.Account] = entry as AccountRoot;
            }

            if(entry.LedgerEntryType === 'Hook' && entry.Hooks.length > 1) {

              let treasuryHooks:string[] = entry.Hooks.map(hook => hook.Hook.HookHash);

              if(treasuryHooks.length > 1 && treasuryHooks.includes(this.TREASURY_HOOK_HASH_1) && treasuryHooks.includes(this.TREASURY_HOOK_HASH_2)) {
                this.treasuryAccounts.push(entry.Account);
              }
            }

            if(entry.LedgerEntryType === 'Offer') {
              if(!this.offers[entry.Account]) {
                this.offers[entry.Account] = [entry as Offer];
              } else {
                this.offers[entry.Account].push(entry as Offer);
              }
            }

            if(entry.LedgerEntryType === 'SignerList') {
              this.signer_lists[entry.index] = entry as SignerList;
            }

            if(entry.LedgerEntryType === 'Escrow') {
              //only add XAH escrows
              if(!isNaN(Number(entry.Amount))) {
                this.lockedInEscrows = this.lockedInEscrows + Number(entry.Amount);
              }
            }

            if(entry.LedgerEntryType === 'PayChannel') {
              //only count XAH paychannels
              if(!isNaN(Number(entry.Amount))) {
                this.lockedInPaychans = this.lockedInPaychans + (Number(entry.Amount) - Number(entry.Balance));
              }
            }

            if(entry.LedgerEntryType === 'FeeSettings') {
              this.feeSetting = entry as FeeSettings;
            }
        }
    }

    public async calculateSupplyAndSave(): Promise<void> {

      try {

        let accountReserve = 1_000_000;
        let ownerReserve = 200_000;

        if(this.feeSetting) {
          if('ReserveBaseDrops' in this.feeSetting && 'ReserveIncrementDrops' in this.feeSetting) {
            accountReserve = Number(this.feeSetting.ReserveBaseDrops);
            ownerReserve = Number(this.feeSetting.ReserveIncrementDrops);
          } else {
            accountReserve = this.feeSetting.ReserveBase;
            ownerReserve = this.feeSetting.ReserveIncrement;
          }
        }

        console.log("accountReserve", accountReserve);
        console.log("ownerReserve", ownerReserve);

        let totalInAccounts = 0;
        let circulating = 0;
        let numberOfAccounts = 0;
        let totalReserved = 0;
        let totalTransientReserves = 0;
        let totalInTreasury = 0;
        let totalInTreasuryLocked = 0;
      

        for(let account in this.accounts) {
          if(this.accounts.hasOwnProperty(account)) {
            let accRoot = this.accounts[account];

            let spendableAccountBalance = this.isAccountBlackHoled(accRoot) ? 0 : Number(accRoot.Balance);
            let reserved = accountReserve + (accRoot.OwnerCount * ownerReserve);
            let transientReserve = (this.offers[accRoot.Account] || []).length * ownerReserve;

            let canCirculateAmount = Math.max(spendableAccountBalance - reserved + transientReserve, 0)

            totalInAccounts = totalInAccounts + Number(accRoot.Balance);
            //add spendable to total count
            if(canCirculateAmount > 0) {
              circulating = circulating + canCirculateAmount;
            }

            //check treasury accounts
            if(this.treasuryAccounts.includes(account)) {
              totalInTreasury = totalInTreasury + Number(accRoot.Balance);

              let locked = this.isAccountBlackHoled(accRoot) ? Number(accRoot.Balance) : 0;
              totalInTreasuryLocked = totalInTreasuryLocked + locked;
            }

            totalReserved = totalReserved + reserved;
            totalTransientReserves = totalTransientReserves + transientReserve;

            numberOfAccounts++;
          }
        }

        let ledger_data:any = this.ledgerData.getLedgerData();

        if(ledger_data?.accountroot?.count != numberOfAccounts) {
          //something is wrong. null ledger data coz it does not match!
          console.log("MISMATCH OF NUMBER OF ACCOUNTS:")
          console.log("ledger_data?.accountroot?.count: " + ledger_data?.accountroot?.count);
          console.log("numberOfAccounts: " + numberOfAccounts);

          ledger_data = null;
        }

        if(ledger_data?.accountroot?.special_data?.BalanceValueTotal != totalInAccounts ) {
          //something is wrong. null ledger data coz it does not match!
          console.log("MISMATCH OF XRP IN XRPL ACCOUNTS:")
          console.log("ledger_data?.accountroot?.special_data?.BalanceValueTotal: " + ledger_data?.accountroot?.special_data?.BalanceValueTotal);
          console.log("totalXrpInAccounts: " + totalInAccounts);

          ledger_data = null;
        }

        console.log("numberOfAccounts", numberOfAccounts);
        console.log("totalInAccounts", totalInAccounts);
        console.log("lockedInEscrows", this.lockedInEscrows);
        console.log("lockedInPaychans", this.lockedInPaychans);
        console.log("circulatingXAH", circulating);
        console.log("totalReserved", totalReserved);
        console.log("totalTransientReserves", totalTransientReserves);
        console.log("totalInTreasury", totalInTreasury);
        console.log("totalInTreasuryLocked", totalInTreasuryLocked);


        this.supplyInfo = {
          ledger: this.getCurrentLedgerIndex(),
          closeTimeHuman: this.getCurrentLedgerCloseTime(),
          accounts: numberOfAccounts,
          xahExisting: (totalInAccounts + this.lockedInEscrows)/1000000,
          xah: {
            xahTotalSupply: circulating/1000000,
            xahTotalBalance: totalInAccounts/1000000,
            xahTotalReserved: totalReserved/1000000,
            xahTotalTransientReserves: totalTransientReserves/1000000,
            xahInEscrow: this.lockedInEscrows/1000000,
            xahInTreasury: totalInTreasury/1000000,
            xahInTreasuryLocked: totalInTreasuryLocked/1000000
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
      this.lockedInEscrows = 0;
      this.feeSetting = null;
      this.accounts = {};
      this.offers = {};
      this.signer_lists = {};
      
    }

    public async saveSupplyInfoToFS(): Promise<void> {
      try {
        let supplyInfoToSave:string = JSON.stringify(this.supplyInfo);
        if(supplyInfoToSave && supplyInfoToSave.length > 0) {

            fs.writeFileSync(DATA_PATH+"supplyInfo.js", supplyInfoToSave);

            console.log("saved supply info to file system");
        } else {
          console.log("supply info is empty! Nothing saved");
        }
      } catch(err) {
        console.log(err);
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

  isAccountBlackHoled(accountRoot: AccountRoot): boolean {
    let signerListHash = this.createSignerListHash(accountRoot.Account);

    //known blackhole accounts
    if(this.blackholeAccounts.includes(accountRoot.Account)) {
      return true;
    }
    
    //if master key disabled, no regular key set (or set to blackholed account) and no signer list -> black holed
    if(this.isMasterKeyDisabled(accountRoot.Flags) && (!accountRoot.RegularKey || this.blackholeAccounts.includes(accountRoot.RegularKey)) && !this.signer_lists[signerListHash]) {
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