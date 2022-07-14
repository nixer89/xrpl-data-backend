import * as fs from 'fs';
import { IssuerAccounts } from './issuerAccounts';
import { LedgerScanner } from './ledgerScanner';
import { AdaptedLedgerObject } from './util/types';

export class LedgerData {

    private static _instance: LedgerData;

    private ledgerData_1: any;
    private ledgerData_2: any;

    private issuerAccount:IssuerAccounts;


    FLAG_65536:number = 65536;
    FLAG_131072:number = 131072;
    FLAG_262144:number = 262144;
    FLAG_524288:number = 524288;
    FLAG_1048576:number = 1048576;
    FLAG_2097152:number = 2097152;
    FLAG_4194304:number = 4194304;
    FLAG_8388608:number = 8388608;
    FLAG_16777216:number = 16777216;

    private constructor() { }

    public static get Instance(): LedgerData
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async init(load1:boolean): Promise<void> {
        //await this.loadLedgerDataFromFS(load1);
        this.issuerAccount = IssuerAccounts.Instance;
    }

    public async resolveLedgerData(ledgerState:any, load1:boolean): Promise<void> {

        for(let i = 0; i < ledgerState.length; i++) {
            let ledgerObject:AdaptedLedgerObject = ledgerState[i];
            if(this.getLedgerData(load1)[ledgerObject.parsed.LedgerEntryType.toLowerCase()]) {
              //add entry to existing one
              let size = Buffer.from(ledgerObject.data, 'utf8').length;

              this.getLedgerData(load1)[ledgerObject.parsed.LedgerEntryType.toLowerCase()].size += size;
              this.getLedgerData(load1)[ledgerObject.parsed.LedgerEntryType.toLowerCase()].count += 1;
            } else {
              //create new entry
              let size = Buffer.from(ledgerObject.data, 'utf8').length;;
              
              let newLedgerObject:any = {
                count: 1,
                size: size,
                percentage: 0
              }

              this.getLedgerData(load1)[ledgerObject.parsed.LedgerEntryType.toLowerCase()] = newLedgerObject;
            }

            this.addAdditionalData(load1, ledgerObject.parsed);
        }

          //console.log(JSON.stringify(this.getLedgerData(load1)));
    }

    addAdditionalData(load1: boolean, ledgerObject: any) {

      for (var property in ledgerObject) {
        if (ledgerObject.hasOwnProperty(property)) {
          this.addAdditionalProperty(load1, ledgerObject, property);
        }
      }
      
      /**
      //account root
      this.addAdditionalProperty(load1, ledgerObject, "AccountTxnID");
      this.addAdditionalProperty(load1, ledgerObject, "Domain");
      this.addAdditionalProperty(load1, ledgerObject, "EmailHash");
      this.addAdditionalProperty(load1, ledgerObject, "MessageKey");
      this.addAdditionalProperty(load1, ledgerObject, "RegularKey");
      this.addAdditionalProperty(load1, ledgerObject, "TransferRate");
      this.addAdditionalProperty(load1, ledgerObject, "InvoiceID");
      this.addAdditionalProperty(load1, ledgerObject, "TicketCount");
      this.addAdditionalProperty(load1, ledgerObject, "TickSize");
      this.addAdditionalProperty(load1, ledgerObject, "WalletLocator");
      this.addAdditionalProperty(load1, ledgerObject, "WalletSize");

      //check
      this.addAdditionalProperty(load1, ledgerObject, "DestinationNode");
      this.addAdditionalProperty(load1, ledgerObject, "DestinationTag");
      this.addAdditionalProperty(load1, ledgerObject, "Expiration");
      this.addAdditionalProperty(load1, ledgerObject, "SourceTag");

      //Escrows
      this.addAdditionalProperty(load1, ledgerObject, "Condition");
      this.addAdditionalProperty(load1, ledgerObject, "CancelAfter");
      this.addAdditionalProperty(load1, ledgerObject, "FinishAfter");

      //RippleState
      this.addAdditionalProperty(load1, ledgerObject, "LowQualityIn");
      this.addAdditionalProperty(load1, ledgerObject, "LowQualityOut");
      this.addAdditionalProperty(load1, ledgerObject, "HighQualityIn");
      this.addAdditionalProperty(load1, ledgerObject, "HighQualityOut");
      **/
      
    }

    addAdditionalProperty(load1: boolean, ledgerObject: any, property: string) {
      if(ledgerObject[property]) {
        this.increaseCountForProperty(load1, ledgerObject, "property_count", property, 1);

        //special handling for some properties:
        if("Balance" === property) {
          if((ledgerObject[property].value && ledgerObject[property].value != "0") || (!ledgerObject[property].value && ledgerObject[property] != "0")) {
            this.increaseCountForProperty(load1, ledgerObject, "special_data", "BalanceNotZero", 1);
          }
        }

        if("OwnerCount" === property) {
          //count not owner count!
          this.increaseCountForProperty(load1, ledgerObject, "special_data", "OwnerCountTotal", ledgerObject[property]);
        }

        if("Amount" === property && !ledgerObject[property].value && !ledgerObject[property].issuer) {
          //count total amount of XRP
          this.increaseCountForProperty(load1, ledgerObject, "special_data", "AmountValueTotal", Number(ledgerObject[property]));
        }

        if("Balance" === property && !ledgerObject[property].value && !ledgerObject[property].issuer) {
          //count total amount of XRP
          this.increaseCountForProperty(load1, ledgerObject, "special_data", "BalanceValueTotal", Number(ledgerObject[property]));
        }

        if("SendMax" === property && !ledgerObject[property].value && !ledgerObject[property].issuer) {
          //count total amount of XRP
          this.increaseCountForProperty(load1, ledgerObject, "special_data", "SendMaxValueTotal", Number(ledgerObject[property]));
        }

        if("TakerGets" === property && !ledgerObject[property].value && !ledgerObject[property].issuer) {
          //count total amount of XRP
          this.increaseCountForProperty(load1, ledgerObject, "special_data", "XrpTotal", Number(ledgerObject[property]));
        }

        if("TakerPays" === property && !ledgerObject[property].value && !ledgerObject[property].issuer) {
          //count total amount of XRP
          this.increaseCountForProperty(load1, ledgerObject, "special_data", "XrpTotal", Number(ledgerObject[property]));
        }

        if("Flags" === property && ledgerObject[property]) {

          if("accountroot" === ledgerObject.LedgerEntryType.toLowerCase()) {
            //Account Root Flags
            if(this.isDefaultRippleEnabled(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfDefaultRipple", 1);

            if(this.isDepositAuthEnabled(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfDepositAuth", 1);

            if(this.isMasterKeyDisabled(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfDisableMaster", 1);

            if(this.isDisallowXRPEnabled(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfDisallowXRP", 1);

            if(this.isGlobalFreezeEnabled(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfGlobalFreeze", 1);

            if(this.isNoFreezeEnabled(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfNoFreeze", 1);

            if(this.isPasswordSpentEnabled(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfPasswordSpent", 1);

            if(this.isRequireAuthEnabled(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfRequireAuth", 1);

            if(this.isRequireDestinationTagEnabled(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfRequireDestTag", 1);
          }

          if("offer" === ledgerObject.LedgerEntryType.toLowerCase()) {
            
            //Offer Flags
            if(this.isOfferFlagPassive(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfPassive", 1);

            if(this.isOfferFlagSell(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfSell", 1);
          }

          if("signerlist" === ledgerObject.LedgerEntryType.toLowerCase()) {

            //Signer List Flags
            if(this.isSignerListFlagOneOwnerCount(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfOneOwnerCount", 1);
          }

          if("ripplestate" === ledgerObject.LedgerEntryType.toLowerCase()) {

            if(this.isRippleStateFlagLowReserve(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfLowReserve", 1);
            
            if(this.isRippleStateFlagHighReserve(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfHighReserve", 1);

            if(this.isRippleStateFlagLowAuth(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfLowAuth", 1);

            if(this.isRippleStateFlagHighAuth(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfHighAuth", 1);

            if(this.isRippleStateFlagLowNoRipple(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfLowNoRipple", 1);

            if(this.isRippleStateFlagHighNoRipple(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfHighNoRipple", 1);

            if(this.isRippleStateFlagLowFreeze(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfLowFreeze", 1);

            if(this.isRippleStateFlagHighFreeze(ledgerObject[property]))
              this.increaseCountForProperty(load1, ledgerObject, "flags", "lsfHighFreeze", 1);
          }
        }
      }
    }

    increaseCountForProperty(load1: boolean, ledgerObject: any, storageType:string, property: string, increaseBy: number) {
      //create storage type if not set yet
      if(!this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()][storageType])
        this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()][storageType] = {}

      //add property to storage and set a value
      if(this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()][storageType][property])
        this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()][storageType][property] = this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()][storageType][property] + increaseBy;
      else
        this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()][storageType][property] = increaseBy;
    }

    public getLedgerData(load1: boolean) {
        if(load1)
            return this.ledgerData_1;
        else
            return this.ledgerData_2;
    }

    public getLedgerDataV1(load1: boolean): any[] {
      let dataToUse = JSON.parse(JSON.stringify(load1 ? this.ledgerData_2 : this.ledgerData_1))
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

    public clearLedgerData(load1: boolean) {
        if(load1)
            this.ledgerData_1 = {};
        else
            this.ledgerData_2 = {};
    }

    private setLedgerData(ledgerData: any, load1:boolean): void{
        if(load1)
          this.ledgerData_1 = ledgerData;
        else
          this.ledgerData_2 = ledgerData;
      }

    public async saveLedgerDataToFS(load1:boolean, ledgerIndex: number, hash:string, closeTime: string, closeTimeMs: number): Promise<void> {

        let ledgerDataObjects: any[] = await this.getLedgerDataV1(load1);
        //console.log("ledgerDataObjects: " + JSON.stringify(ledgerDataObjects));

        let returnValue = {
          ledger_index: ledgerIndex,
          ledger_hash: hash,
          ledger_close: closeTime,
          ledger_close_ms: closeTimeMs,
          ledger_size: ledgerDataObjects[0],
          sizeType: "B",
          ledger_data: ledgerDataObjects[1]
        }

        if(returnValue) {

            let fileName = "./../data/" + ledgerIndex + ".js"

            fs.writeFileSync(fileName, JSON.stringify(returnValue));

            console.log("saved ledger data to file system");
        } else {
          console.log("ledger data is empty! Nothing saved");
        }
    }

    private async loadLedgerDataFromFS(load1:boolean): Promise<void> {
      try {
        console.log("loading ledger data from FS");
        if(fs.existsSync("./../ledgerData.js")) {
            let ledgerData:any = JSON.parse(fs.readFileSync("./../ledgerData.js").toString());
            if(ledgerData) {
                //console.log("ledger data loaded: " + JSON.stringify(ledgerData));
                this.setLedgerData(ledgerData, load1);
                console.log("loaded ledger data successfully")
            }
        } else {
          console.log("ledger data file does not exist yet.")
        }
      } catch(err) {
        console.log("error reading issuer data from FS");
        console.log(err);
        this.setLedgerData({}, load1);
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
}