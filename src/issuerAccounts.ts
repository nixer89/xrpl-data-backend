import * as config from './util/config';
import * as ripple from 'ripple-lib';
import * as scheduler from 'node-schedule';
import * as fs from 'fs';
import { LedgerDataRequest, LedgerDataResponse, LedgerResponse } from 'ripple-lib';
import consoleStamp = require("console-stamp");
import { RippleStateLedgerEntry } from 'ripple-lib/dist/npm/common/types/objects';
import { AccountNames } from './accountNames';
import { IssuerData } from "./util/types"

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class IssuerAccounts {

    private useProxy = config.USE_PROXY;
    
    private accountInfo:AccountNames = new AccountNames();

    private issuers_1: Map<string, IssuerData> = new Map();
    private issuers_2: Map<string, IssuerData> = new Map();
    private ledger_index_1: string;
    private ledger_index_2: string;
    private ledger_date_1: string;
    private ledger_date_2: string;
    private ledger_time_ms_1: number;
    private ledger_time_ms_2: number;
    private ledger_hash_1: string;
    private ledger_hash_2: string;

    private load1: boolean = true;

    private websocket:ripple.RippleAPI;

    public async init(): Promise<void> {
        await this.accountInfo.resolveAllUserNames();
        await this.loadIssuerDataFromFS();

        //load issuer data if it could not be read from the file system
        if(this.load1 && this.issuers_1.size == 0 || !this.load1 && this.issuers_2.size == 0)
            await this.readIssuedToken(null, null);

        this.load1=!this.load1;

        scheduler.scheduleJob("readIssuedToken", {minute: 0}, async () => { await this.readIssuedToken(null, null); this.load1=!this.load1});
        scheduler.scheduleJob("readIssuedToken", {minute: 30}, async () => { await this.readIssuedToken(null, null); this.load1=!this.load1});
    }

    public async readIssuedToken(ledgerIndex:string, marker:string): Promise<void> {
        //console.log("new call: ledgerIndex: " + ledgerIndex);
        console.log("new call: marker: " + marker);
        if(!marker) {
          if(this.load1) {
            this.issuers_1.clear();
            this.ledger_date_1 = null;
            this.ledger_time_ms_1 = null;
            this.ledger_index_1 = null;
            this.ledger_hash_1 = null;
          } else {
            this.issuers_2.clear();
            this.ledger_date_2 = null;
            this.ledger_time_ms_2 = null;
            this.ledger_index_2 = null;
            this.ledger_hash_2 = null;
          }
        }
      
      
        let ledger_data:LedgerDataRequest = {
          limit: 100000
        }
      
        if(ledgerIndex)
          ledger_data.ledger_index = ledgerIndex;
      
        if(marker)
          ledger_data.marker = marker;
      
        try { 
          if(!this.websocket || !this.websocket.isConnected()) {
            if(this.useProxy)
                this.websocket = new ripple.RippleAPI({server: "wss://xrpl.ws", proxy: config.PROXY_URL, timeout: 120000});
            else
                this.websocket = new ripple.RippleAPI({server: "wss://xrpl.ws", timeout: 120000});
      
            try {
              await this.websocket.connect();
            } catch(err) {
              return this.readIssuedToken(ledgerIndex, marker);
            }
          }
      
          //console.log("connected to xrpl.ws");
          //console.log("calling with: " + JSON.stringify(ledger_data));
      
          let message:LedgerDataResponse;
        
          message = await this.websocket.request('ledger_data', ledger_data);
      
          //console.log("got response: " + JSON.stringify(message).substring(0,1000));
      
          if(message && message.state && message.ledger_index) {
            let newledgerIndex:string = message.ledger_index;
            let newMarker:string = message.marker;
      
            console.log("marker: " + newMarker);
            console.log("ledger_index: " + newledgerIndex);
            let rippleStates:RippleStateLedgerEntry[] = message.state.filter(element => element.LedgerEntryType === 'RippleState');
      
            for(let i = 0; i < rippleStates.length; i++) {
              let amount:number = Number.parseFloat(rippleStates[i].Balance.value);
              let currency:string = rippleStates[i].Balance.currency;
              let issuer:string = amount > 0 ? rippleStates[i].HighLimit.issuer : rippleStates[i].LowLimit.issuer;
      
              amount = amount < 0 ? amount * -1 : amount;
              issuer = issuer + "_" + currency;
      
              if(amount > 0) {
                //console.log("issuer: " + issuer);
                //console.log("balance: " + balance);
      
                await this.addIssuer(issuer, amount);
              }
            }
      
            //console.log("done");
      
            console.log("issuer_1 size: " + this.issuers_1.size);
            console.log("issuer_2 size: " + this.issuers_2.size);
            if(newledgerIndex != null && newMarker != null)
                return this.readIssuedToken(newledgerIndex, newMarker);
            else {
              console.log("Done 1");
              console.log("issuer_1 size: " + this.issuers_1.size);
              console.log("issuer_2 size: " + this.issuers_2.size);
            }
          } else {
            console.log("Done 2");
            console.log("issuer_1 size: " + this.issuers_1.size);
            console.log("issuer_2 size: " + this.issuers_2.size);
          }
      
          console.log("ALL DONE");
          //always save resolved user names to file system to make restart of server much faster
          this.accountInfo.saveBithompUserNamesToFS();
          this.saveIssuerDataToFS();
      
          let ledgerInfo:LedgerResponse = await this.websocket.request('ledger', {ledger_index: ledgerIndex});
      
          if(this.load1) {
            this.ledger_index_1 = ledgerIndex;
            this.ledger_hash_1 = ledgerInfo.ledger_hash;
            this.ledger_date_1 = ledgerInfo.ledger.close_time_human;
            this.ledger_time_ms_1 = ledgerInfo.ledger.close_time;
          } else {
            this.ledger_index_2 = ledgerIndex;
            this.ledger_hash_2 = ledgerInfo.ledger_hash;
            this.ledger_date_2 = ledgerInfo.ledger.close_time_human;
            this.ledger_time_ms_2 = ledgerInfo.ledger.close_time;
          }
      
          this.websocket.disconnect();
          this.websocket = null;
      
        } catch(err) {
          console.log(err);
          try {
            if(this.websocket && this.websocket.isConnected())
            this.websocket.disconnect();
          } catch(err) {
            //nothing to do
          }
          
          this.websocket = null;
          if(marker != null || (marker == null && ledgerIndex == null))
            return this.readIssuedToken(ledgerIndex, marker);
        }
      }
    
      private async addIssuer(issuer:string, amount:number): Promise<void> {
        if(this.hasIssuer(issuer)) {
            this.addExistingIssuer(issuer, amount);
        } else {
            this.addNewIssuer(issuer, amount, 1);
          //initialize user name to have faster access later on
          await this.accountInfo.initAccountNames(issuer.substring(0, issuer.indexOf("_")));
        }
      }
      
      private hasIssuer(issuer: string) : boolean {
        if(this.load1)
          return this.issuers_1.has(issuer);
        else
          return this.issuers_2.has(issuer);
      }
      
      private addNewIssuer(issuer:string, amount: number, trustlines: number): void {
        if(this.load1)
            this.issuers_1.set(issuer, {amount: amount, trustlines: trustlines});
        else
            this.issuers_2.set(issuer, {amount: amount, trustlines: trustlines});
      }
      
      private getIssuerData(issuer:string): IssuerData {
        if(this.load1)
          return this.issuers_1.get(issuer);
        else
          return this.issuers_2.get(issuer);
      }
      
      private addExistingIssuer(issuer: string, amount:number) {
        let issuerData:IssuerData = this.getIssuerData(issuer);
        let newAmount = issuerData.amount + amount
        //console.log("setting issuer old");
        this.addNewIssuer(issuer, newAmount, ++issuerData.trustlines);
      }
      
      private transformIssuers(issuers: Map<string, IssuerData>): any {
        let transformedIssuers:any = {}
      
        issuers.forEach((data: IssuerData, key: string, map) => {
          let acc:string = key.substring(0, key.indexOf("_"));
          let currency:string = key.substring(key.indexOf("_")+1, key.length);
          let userName:string = this.accountInfo.getUserName(acc);
      
          if(!transformedIssuers[acc]) {
            transformedIssuers[acc] = {
              username: userName,
              tokens: [{currency: currency, amount: data.amount, trustlines: data.trustlines}]
            }
          } else {
            transformedIssuers[acc].tokens.push({currency: currency, amount: data.amount, trustlines: data.trustlines});
          }
      
        });
      
        return transformedIssuers;
      }

    public getLedgerIndex(): string {
        return this.load1 ? this.ledger_index_2 : this.ledger_index_1;
    }

    public getLedgerHash(): string {
        return this.load1 ? this.ledger_hash_2 : this.ledger_hash_1;
    }

    public getLedgerCloseTime(): string {
        return this.load1 ? this.ledger_date_2 : this.ledger_date_1;
    }

    public getLedgerCloseTimeMs(): number {
        return this.load1 ? this.ledger_time_ms_2 : this.ledger_time_ms_1;
    }

    public getLedgerTokens(): any {
        return this.transformIssuers(new Map(this.load1 ? this.issuers_2 : this.issuers_1));
    }

    public async saveIssuerDataToFS(): Promise<void> {
        let mapToSave:Map<string, IssuerData> = new Map(this.load1 ? this.issuers_2 : this.issuers_1);
        if(mapToSave && mapToSave.size > 0) {
            let issuerData:any = {};
            mapToSave.forEach((value, key, map) => {
                issuerData[key] = value;
            });
            fs.writeFileSync("../issuerData.js", JSON.stringify(issuerData));

            console.log("saved " + mapToSave.size + " issuer data to file system");
        }
    }

    private async loadIssuerDataFromFS(): Promise<void> {
        let loadedMap:Map<string, IssuerData> = new Map();
        if(fs.existsSync("../issuerData.js")) {
            let issuerData:any = fs.readFileSync("../issuerData.js").toJSON();
            if(issuerData) {
                for (var account in issuerData) {
                    if (issuerData.hasOwnProperty(account)) {
                        loadedMap.set(account, issuerData[account]);
                    }
                }

                console.log("loaded " + loadedMap.size + " issuer data from file system");

                if(this.load1)
                    this.issuers_1 = new Map(loadedMap);
                else
                    this.issuers_2 = new Map(loadedMap);
            }
        }
    }
}