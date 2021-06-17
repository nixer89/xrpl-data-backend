import * as fs from 'fs';
import { AdaptedLedgerObject } from './util/types';

export class LedgerData {

    private static _instance: LedgerData;

    private ledgerData_1: any;
    private ledgerData_2: any;

    private constructor() { }

    public static get Instance(): LedgerData
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async init(load1:boolean): Promise<void> {
        await this.loadLedgerDataFromFS(load1);
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
                percentage: 0,
                objects: {}
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
        if(this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()]['property_count'][property])
            this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()]['property_count'][property] = this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()]['property_count'][property] + 1;
        else
          this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()]['property_count'][property] = 1
      }
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

    public async saveLedgerDataToFS(load1:boolean): Promise<void> {
        let ledgerDataToSave:string = JSON.stringify(load1 ? this.ledgerData_1 : this.ledgerData_2);
        if(ledgerDataToSave && ledgerDataToSave.length > 0) {

            fs.writeFileSync("./../ledgerData.js", ledgerDataToSave);

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
}