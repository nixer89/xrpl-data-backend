import * as fs from 'fs';
import { DATA_PATH } from './util/config';
import { AdaptedLedgerObject, AMMPool, IOU } from './util/types';
import { AccountRoot, AMM, RippleState } from 'xrpl/dist/npm/models/ledger';

require("log-timestamp");

export class LedgerData {

    private static _instance: LedgerData;

    private ledgerData: any = {};
    private escrows:any[] = [];
    private offers:any[] = [];
    private ammPools:AMMPool[] = [];

    private ammAccountRoots:Map<string, AccountRoot> = new Map();
    private ammTrustlines:Map<string, RippleState[]> = new Map();
    private ammAMMs:Map<string, AMM> = new Map();

    private uniqueAccountProperties:string[] = ["Account","Destination","Owner","Authorize","NFTokenMinter","RegularKey"];
    private uniqueAccounts:Map<string,Map<string,number>> = new Map();
    private scannedObjects:number = 0;
    private objectsScanned:any = {};
    private objectsScannedAbove16:any = {};

    private current_ledger_index: number;
    private current_ledger_date: string;
    private current_ledger_time_ms: number;
    private current_ledger_hash: string;

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

    FLAG_AMM_NODE = 0x01000000;

    private constructor() { }

    public static get Instance(): LedgerData
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async resolveLedgerData(ledgerState:any): Promise<void> {

        for(let i = 0; i < ledgerState.length; i++) {
            let ledgerObject:AdaptedLedgerObject = ledgerState[i];
            if(this.getLedgerData()[ledgerObject.parsed.LedgerEntryType.toLowerCase()]) {
              //add entry to existing one
              let size = Buffer.from(ledgerObject.data, 'utf8').length;

              this.getLedgerData()[ledgerObject.parsed.LedgerEntryType.toLowerCase()].size += size;
              this.getLedgerData()[ledgerObject.parsed.LedgerEntryType.toLowerCase()].count += 1;
            } else {
              //create new entry
              let size = Buffer.from(ledgerObject.data, 'utf8').length;;
              
              let newLedgerObject:any = {
                count: 1,
                size: size,
                percentage: 0
              }

              this.getLedgerData()[ledgerObject.parsed.LedgerEntryType.toLowerCase()] = newLedgerObject;
            }

            this.addAdditionalData(ledgerObject.parsed);

            this.scannedObjects++;

            if(this.objectsScanned[ledgerObject.parsed.LedgerEntryType]) {
              this.objectsScanned[ledgerObject.parsed.LedgerEntryType] += 1;
            } else {
              this.objectsScanned[ledgerObject.parsed.LedgerEntryType] = 1;
            }

            if(this.scannedObjects%1_000_000 == 0) {
              console.log("Scanned objects: " + this.scannedObjects);
              console.log(JSON.stringify(this.objectsScanned));
            }
        }

        //console.log("Total scanned objects: " + this.scannedObjects);
        //console.log(JSON.stringify(this.getLedgerData()));
    }

    addAdditionalData(ledgerObject: any) {

      for (var property in ledgerObject) {
        if (ledgerObject.hasOwnProperty(property)) {
          this.addAdditionalProperty(ledgerObject, property);
        }
      }

      if("nftokenpage" === ledgerObject.LedgerEntryType.toLowerCase() && !ledgerObject["NFTokens"]) {
        this.increaseCountForProperty(ledgerObject, "nftoken_page_sizes","0", 1);
      }

      if("directorynode" === ledgerObject.LedgerEntryType.toLowerCase() && !ledgerObject["Indexes"]) {

        if(ledgerObject["Owner"])
          this.increaseCountForProperty(ledgerObject, "owner_page_sizes", "0", 1);
        else if (ledgerObject["NFTokenID"])
          this.increaseCountForProperty(ledgerObject, "nft_offer_page_sizes", "0", 1);
        else
          this.increaseCountForProperty(ledgerObject, "offer_page_sizes", "0", 1);
      }

      if("ledgerhashes" === ledgerObject.LedgerEntryType.toLowerCase() && !ledgerObject["Hashes"]) {
        this.increaseCountForProperty(ledgerObject, "ledger_hashes_array_sizes", "0", 1);
      }

      if("signerlist" === ledgerObject.LedgerEntryType.toLowerCase() && !ledgerObject["SignerEntries"]) {
        this.increaseCountForProperty(ledgerObject, "signer_list_sizes", "0", 1);
      }

      if("escrow" === ledgerObject.LedgerEntryType.toLowerCase()) {
        this.escrows.push(ledgerObject)
      }

      if("offer" === ledgerObject.LedgerEntryType.toLowerCase()) {
        this.offers.push(ledgerObject)
      }

      //amm logic
      if("ripplestate" === ledgerObject.LedgerEntryType.toLowerCase()) {
        let trustline:RippleState = ledgerObject as RippleState;
        if(this.isAmmTrustline(trustline.Flags)) {
          //this is an AMM trustline
          //extract the issuer and amm account and its token balance
          const trustlineBalance = Number(trustline.Balance.value);
          let ammAccount:string = "";

          //positive balance means HIGH account is ISSUER and LOW account is AMM
          if(trustlineBalance > 0) {
            ammAccount = trustline.LowLimit.issuer;
          } else if(trustlineBalance < 0) { //negative balance means LOW account is ISSUER and HIGH account is AMM
            ammAccount = trustline.HighLimit.issuer;
          }

          if(this.ammTrustlines.has(ammAccount)) {
            this.ammTrustlines.get(ammAccount).push(trustline);
          } else {
            this.ammTrustlines.set(ammAccount, [trustline]);
          }
        }
      }

      if("accountroot" === ledgerObject.LedgerEntryType.toLowerCase()) {
        let accRoot:AccountRoot = ledgerObject as AccountRoot;

        if(accRoot.AMMID) {
          //AMM account
          this.ammAccountRoots.set(accRoot.Account, accRoot);
        }
      }

      if("amm" === ledgerObject.LedgerEntryType.toLowerCase()) {
        let amm:AMM = ledgerObject as AMM;
        this.ammAMMs.set(amm.Account, amm);
      }
    }

    addAdditionalProperty(ledgerObject: any, property: string) {
      if(ledgerObject[property]) {
        this.increaseCountForProperty(ledgerObject, "property_count", property, 1);

        //special handling for some properties:
        if(this.uniqueAccountProperties.includes(property) && ledgerObject[property].length > 0) { //make sure property is set
          let account = ledgerObject[property];

          if(!this.uniqueAccounts.has(ledgerObject.LedgerEntryType.toLowerCase()+"_unique_"+property.toLowerCase())) {
            this.uniqueAccounts.set(ledgerObject.LedgerEntryType.toLowerCase()+"_unique_"+property.toLowerCase(), new Map());
          }

          if(!this.uniqueAccounts.get(ledgerObject.LedgerEntryType.toLowerCase()+"_unique_"+property.toLowerCase()).has(account)) {
            this.uniqueAccounts.get(ledgerObject.LedgerEntryType.toLowerCase()+"_unique_"+property.toLowerCase()).set(account,1);
            this.increaseCountForProperty(ledgerObject, "special_data", "Unique"+property, 1);
          }
        }

        if("HighLimit" === property || "LowLimit" === property) {
          let account = ledgerObject[property].issuer;

          if(!this.uniqueAccounts.has(ledgerObject.LedgerEntryType.toLowerCase()+"_unique_accounts")) {
            this.uniqueAccounts.set(ledgerObject.LedgerEntryType.toLowerCase()+"_unique_accounts", new Map());
          }

          if(!this.uniqueAccounts.get(ledgerObject.LedgerEntryType.toLowerCase()+"_unique_accounts").has(account)) {
            this.uniqueAccounts.get(ledgerObject.LedgerEntryType.toLowerCase()+"_unique_accounts").set(account,1);
            this.increaseCountForProperty(ledgerObject, "special_data", "UniqueAccount", 1);
          }
        }

        if("Balance" === property) {
          if((ledgerObject[property].value && ledgerObject[property].value != "0") || (!ledgerObject[property].value && ledgerObject[property] != "0")) {
            this.increaseCountForProperty(ledgerObject, "special_data", "BalanceNotZero", 1);
          }
        }

        if("OwnerCount" === property) {
          //count not owner count!
          this.increaseCountForProperty(ledgerObject, "special_data", "OwnerCountTotal", ledgerObject[property]);
        }

        if("Amount" === property && !ledgerObject[property].value && !ledgerObject[property].issuer) {
          //count total amount of XRP
          this.increaseCountForProperty(ledgerObject, "special_data", "AmountValueTotal", Number(ledgerObject[property]));
        }

        if("Balance" === property && !ledgerObject[property].value && !ledgerObject[property].issuer) {
          //count total amount of XRP
          this.increaseCountForProperty(ledgerObject, "special_data", "BalanceValueTotal", Number(ledgerObject[property]));
        }

        if("SendMax" === property && !ledgerObject[property].value && !ledgerObject[property].issuer) {
          //count total amount of XRP
          this.increaseCountForProperty(ledgerObject, "special_data", "SendMaxValueTotal", Number(ledgerObject[property]));
        }

        if("TakerGets" === property && !ledgerObject[property].value && !ledgerObject[property].issuer) {
          //count total amount of XRP
          this.increaseCountForProperty(ledgerObject, "special_data", "XrpTotal", Number(ledgerObject[property]));
        }

        if("TakerPays" === property && !ledgerObject[property].value && !ledgerObject[property].issuer) {
          //count total amount of XRP
          this.increaseCountForProperty(ledgerObject, "special_data", "XrpTotal", Number(ledgerObject[property]));
        }

        if("NFTokens" === property) {
          //count not owner count!
          this.increaseCountForProperty(ledgerObject, "special_data", "NftTotal", ledgerObject[property].length);

          this.increaseCountForProperty(ledgerObject, "nftoken_page_sizes", ledgerObject[property].length+"", 1);
        }

        if("MintedNFTokens" === property) {
          //count total amount of XRP
          this.increaseCountForProperty(ledgerObject, "special_data", "TotalMintedNFTs", Number(ledgerObject[property]));
        }

        if("BurnedNFTokens" === property) {
          //count total amount of XRP
          this.increaseCountForProperty(ledgerObject, "special_data", "TotalBurnedNFTs", Number(ledgerObject[property]));
        }

        if("Indexes" === property) {

          if("directorynode" === ledgerObject.LedgerEntryType.toLowerCase()) {
            if(ledgerObject["Owner"]) {
              this.increaseCountForProperty(ledgerObject, "owner_page_sizes", ledgerObject[property].length+"", 1);
            } else if(ledgerObject["NFTokenID"]) {
              this.increaseCountForProperty(ledgerObject, "nft_offer_page_sizes", ledgerObject[property].length+"", 1);
            } else {
              this.increaseCountForProperty(ledgerObject, "offer_page_sizes", ledgerObject[property].length+"", 1);
            }
          } else {
            this.increaseCountForProperty(ledgerObject, "page_sizes", ledgerObject[property].length+"", 1);
          }
        }

        if("Hashes" === property) {
          //count not owner count!
          this.increaseCountForProperty(ledgerObject, "special_data", "LedgerHashesTotal", ledgerObject[property].length);

          this.increaseCountForProperty(ledgerObject, "ledger_hashes_array_sizes", ledgerObject[property].length+"", 1);
        }

        if("SignerEntries" === property) {
          //count not owner count!
          this.increaseCountForProperty(ledgerObject, "special_data", "SignerListEntryTotals", ledgerObject[property].length);

          this.increaseCountForProperty(ledgerObject, "signer_list_sizes", ledgerObject[property].length+"", 1);
        }

        if("Flags" === property && ledgerObject[property]) {

          if("accountroot" === ledgerObject.LedgerEntryType.toLowerCase()) {
            //Account Root Flags
            if(this.isDefaultRippleEnabled(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfDefaultRipple", 1);

            if(this.isDepositAuthEnabled(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfDepositAuth", 1);

            if(this.isMasterKeyDisabled(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfDisableMaster", 1);

            if(this.isDisallowXRPEnabled(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfDisallowXRP", 1);

            if(this.isGlobalFreezeEnabled(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfGlobalFreeze", 1);

            if(this.isNoFreezeEnabled(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfNoFreeze", 1);

            if(this.isPasswordSpentEnabled(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfPasswordSpent", 1);

            if(this.isRequireAuthEnabled(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfRequireAuth", 1);

            if(this.isRequireDestinationTagEnabled(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfRequireDestTag", 1);
          }

          if("offer" === ledgerObject.LedgerEntryType.toLowerCase()) {
            
            //Offer Flags
            if(this.isOfferFlagPassive(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfPassive", 1);

            if(this.isOfferFlagSell(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfSell", 1);
          }

          if("signerlist" === ledgerObject.LedgerEntryType.toLowerCase()) {

            //Signer List Flags
            if(this.isSignerListFlagOneOwnerCount(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfOneOwnerCount", 1);
          }

          if("ripplestate" === ledgerObject.LedgerEntryType.toLowerCase()) {

            if(this.isRippleStateFlagLowReserve(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfLowReserve", 1);
            
            if(this.isRippleStateFlagHighReserve(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfHighReserve", 1);

            if(this.isRippleStateFlagLowAuth(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfLowAuth", 1);

            if(this.isRippleStateFlagHighAuth(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfHighAuth", 1);

            if(this.isRippleStateFlagLowNoRipple(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfLowNoRipple", 1);

            if(this.isRippleStateFlagHighNoRipple(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfHighNoRipple", 1);

            if(this.isRippleStateFlagLowFreeze(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfLowFreeze", 1);

            if(this.isRippleStateFlagHighFreeze(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfHighFreeze", 1);
          }

          if("nftokenoffer" === ledgerObject.LedgerEntryType.toLowerCase()) {

            if(this.isNFTokenOfferFlagSell(ledgerObject[property]))
              this.increaseCountForProperty(ledgerObject, "flags", "lsfSellNFToken", 1);
          }
        }
      }
    }

    increaseCountForProperty(ledgerObject: any, storageType:string, property: string, increaseBy: number) {
      //create storage type if not set yet
      if(!this.getLedgerData()[ledgerObject.LedgerEntryType.toLowerCase()][storageType])
        this.getLedgerData()[ledgerObject.LedgerEntryType.toLowerCase()][storageType] = {}

      //add property to storage and set a value
      if(this.getLedgerData()[ledgerObject.LedgerEntryType.toLowerCase()][storageType][property])
        this.getLedgerData()[ledgerObject.LedgerEntryType.toLowerCase()][storageType][property] = this.getLedgerData()[ledgerObject.LedgerEntryType.toLowerCase()][storageType][property] + increaseBy;
      else
        this.getLedgerData()[ledgerObject.LedgerEntryType.toLowerCase()][storageType][property] = increaseBy;
    }

    public getLedgerData() {
      return this.ledgerData;
    }

    public getEscrows() {
      return this.escrows;
    }

    public getOffers() {
      return this.offers;
    }

    public getAmmPools() {
      return this.ammPools;
    }

    public getLedgerDataV1(): any[] {
      let dataToUse = JSON.parse(JSON.stringify(this.ledgerData))
      let totalBytes:number = 0;
      for (let data in dataToUse) {
        if (dataToUse.hasOwnProperty(data)) {
            totalBytes += dataToUse[data].size;
        }
      }

      for (let data in dataToUse) {
        if (dataToUse.hasOwnProperty(data)) {
            dataToUse[data].percentage = Math.round(dataToUse[data].size * 100 / totalBytes*1000000)/1000000
        }
      }

      return [totalBytes, dataToUse];
    }

    public clearLedgerData() {
      this.ledgerData = {};
      this.escrows = [];
      this.offers = [];
      this.uniqueAccounts = new Map();
      this.scannedObjects = 0;
    }

    public async saveLedgerDataToFS(): Promise<void> {
      try {
        if(this.ledgerData) {

          let ledger_data:any = {
            ledger_index: this.getCurrentLedgerIndex(),
            ledger_hash: this.getCurrentLedgerHash(),
            ledger_close: this.getCurrentLedgerCloseTime(),
            ledger_close_ms: this.getCurrentLedgerCloseTimeMs(),
            ledger_data: this.ledgerData
          };

          fs.writeFileSync(DATA_PATH+"ledgerData.js", JSON.stringify(ledger_data));

          console.log("saved ledger data to file system");
        } else {
          console.log("ledger data is empty! Nothing saved");
        }
      } catch(err) {
        console.log(err);
      }

      try {
        let escrowsToSave:string = JSON.stringify({escrows: this.escrows});
        if(escrowsToSave && escrowsToSave.length > 0) {

            fs.writeFileSync(DATA_PATH+"escrows.js", escrowsToSave);

            console.log("saved escrows to file system");
        } else {
          console.log("escrows empty! Nothing saved");
        }
      } catch(err) {
        console.log(err);
      }

      try {
        if(this.offers && this.offers.length > 0) {

          let offer_data:any = {
            ledger_index: this.getCurrentLedgerIndex(),
            ledger_hash: this.getCurrentLedgerHash(),
            ledger_close: this.getCurrentLedgerCloseTime(),
            ledger_close_ms: this.getCurrentLedgerCloseTimeMs(),
            offers: this.offers
          };

            fs.writeFileSync(DATA_PATH+"offers.js", JSON.stringify(offer_data));

            console.log(this.offers.length + " offers saved to file system");
        } else {
          console.log("offers empty! Nothing saved");
        }
      } catch(err) {
        console.log(err);
      }

      //collect AMM pool data and save to FS
      try {
        this.ammPools = [];
        let ammAccounts = Array.from(this.ammAMMs.keys());

        for(let i = 0; i < ammAccounts.length; i++) {
          let ammAccount = ammAccounts[i];
          let ammObject:AMM = this.ammAMMs.get(ammAccount);
          let accRoot:AccountRoot = this.ammAccountRoots.get(ammAccount);
          let trustlines:RippleState[] = this.ammTrustlines.get(ammAccount);

          let newAmmPool:AMMPool = {
            Account: ammAccount,
            Flags: ammObject.Flags,
            TradingFee: ammObject.TradingFee,
            Asset: "",
            Asset2: ""
          };

          //determine assets
          if(!ammObject.Asset.issuer ) {
            //asset is XRP, take balance from AccountRoot but deduct reserves
            let xrpBalance = Number(accRoot.Balance) - 1000000 - Number(accRoot.OwnerCount) * 200000; //reserve per owner + base reserve

            newAmmPool.Asset = xrpBalance.toString();
          }
          
          if(!ammObject.Asset2.issuer ) {
            //asset is XRP, take balance from AccountRoot but deduct reserves
            let xrpBalance = Number(accRoot.Balance) - 1000000 - Number(accRoot.OwnerCount) * 200000; //reserve per owner + base reserve

            newAmmPool.Asset2 = xrpBalance.toString();
          }

          //find trustline for asset
          if(trustlines) {
            for(let j = 0; j < trustlines.length; j++) {
              let trustline = trustlines[j];
              if(trustline && trustline.Balance) {
                let balanceValue = Number(trustline.Balance.value);

                let newAsset:IOU = {
                  currency: trustline.Balance.currency,
                  issuer: "",
                  value: ""
                }

                if(balanceValue > 0) {
                    newAsset.issuer = trustline.HighLimit.issuer;
                    newAsset.value = balanceValue.toString();
                } else if (balanceValue < 0) {
                  newAsset.issuer = trustline.LowLimit.issuer;
                  newAsset.value = (balanceValue*-1).toString();
                } else {
                  //trustline has 0 balance
                  newAsset.issuer = trustline.HighLimit.issuer === ammAccount ? trustline.LowLimit.issuer : trustline.HighLimit.issuer;
                  newAsset.value = "0";
                }

                //add new asset to pool
                if(ammObject.Asset.currency === newAsset.currency && ammObject.Asset.issuer === newAsset.issuer) {
                  newAmmPool.Asset = newAsset;
                } else if (ammObject.Asset2.currency === trustline.Balance.currency && ammObject.Asset2.issuer === newAsset.issuer) {
                  newAmmPool.Asset2 = newAsset;
                }
              }
            }
          } else {
            console.log("No trustlines found for AMM account: " + ammAccount);
          }

          this.ammPools.push(newAmmPool);
        }

        if(this.ammPools && this.ammPools.length > 0) {

          let amm_data:any = {
            ledger_index: this.getCurrentLedgerIndex(),
            ledger_hash: this.getCurrentLedgerHash(),
            ledger_close: this.getCurrentLedgerCloseTime(),
            ledger_close_ms: this.getCurrentLedgerCloseTimeMs(),
            amm_pools: this.ammPools
          };

            fs.writeFileSync(DATA_PATH+"amm_pools.js", JSON.stringify(amm_data));

            console.log(this.ammPools.length + " AMM pools saved to file system");
        } else {
          console.log("AMM pools empty! Nothing saved");
        }
      } catch(err) {
        console.log(err);
      }
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

  isAmmTrustline(flags:number) {
    return flags && (flags & this.FLAG_AMM_NODE) == this.FLAG_AMM_NODE;
  }

  public getCurrentLedgerIndex(): number {
    return this.current_ledger_index;
  }

  public setCurrentLedgerIndex(index:number): void {
      this.current_ledger_index = index;
  }

  public getCurrentLedgerHash(): string {
      return this.current_ledger_hash;
  }

  public setCurrentLedgerHash(hash:string): void {
      this.current_ledger_hash = hash;
  }

  public getCurrentLedgerCloseTime(): string {
      return this.current_ledger_date;
  }

  public setCurrentLedgerCloseTime(closeTime: string): void {
      this.current_ledger_date = closeTime;
  }

  public getCurrentLedgerCloseTimeMs(): number {
      return this.current_ledger_time_ms;
  }

  public setCurrentLedgerCloseTimeMs(closeTimeInMs: number): void {
      this.current_ledger_time_ms = closeTimeInMs;
  }
}