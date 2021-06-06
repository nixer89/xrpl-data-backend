var sizeof = require('object-sizeof')
import * as fs from 'fs';

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
            let ledgerObject = ledgerState[i];
            if(this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()]) {
              //add entry to existing one
              this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()].size += sizeof(ledgerObject);
              this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()].count += 1;
            } else {
              //create new entry
              let newLedgerObject:any = {
                size: sizeof(ledgerObject),
                count: 1
              }

              this.getLedgerData(load1)[ledgerObject.LedgerEntryType.toLowerCase()] = newLedgerObject;
            }
        }

          //console.log(JSON.stringify(this.getLedgerData(load1)));
    }

    public getLedgerData(load1: boolean) {
        if(load1)
            return this.ledgerData_1;
        else
            return this.ledgerData_2;
    }

    public getLedgerDataV1(load1: boolean) {
        console.log("loading ledger data: " + load1 + " " + JSON.stringify(this.ledgerData_1));
        if(!load1)
            return JSON.parse(JSON.stringify(this.ledgerData_1));
        else
            return JSON.parse(JSON.stringify(this.ledgerData_2));
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
                console.log("ledger data loaded: " + JSON.stringify(ledgerData));
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