import * as fs from 'fs';
import consoleStamp = require("console-stamp");
import { AccountNames } from './accountNames';
import { IssuerData, IssuerVerification } from "./util/types"
import { LedgerScanner } from './ledgerScanner';
import { TokenCreation } from './tokenCreation';

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class IssuerAccounts {

    private static _instance: IssuerAccounts;
    
    private accountInfo:AccountNames;
    private tokenCreation:TokenCreation;

    private ledgerScanner:LedgerScanner;

    private issuers_1: Map<string, IssuerData> = new Map();
    private issuers_2: Map<string, IssuerData> = new Map();

    private constructor() { }

    public static get Instance(): IssuerAccounts
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async init(load1:boolean): Promise<void> {
        this.accountInfo = AccountNames.Instance;
        this.tokenCreation = TokenCreation.Instance;
        this.ledgerScanner = LedgerScanner.Instance;

        await this.accountInfo.init();
        await this.tokenCreation.init();
        await this.loadIssuerDataFromFS(load1);
    }

    public async resolveIssuerToken(ledgerState:any, load1:boolean): Promise<void> {   

      let rippleStates:any[] = ledgerState.filter(element => element.LedgerEntryType === 'RippleState');

      let dateResolved:boolean = false;

      for(let i = 0; i < rippleStates.length; i++) {
        let amount:number = Number.parseFloat(rippleStates[i].Balance.value);
        let currency:string = rippleStates[i].Balance.currency;
        let issuer:string = null;
        
        if(amount > 0) {
          issuer = rippleStates[i].HighLimit.issuer;
        } else if(amount < 0) {
          issuer = rippleStates[i].LowLimit.issuer
        } else {
          //balance is zero. check who has a limit set
          if(Number.parseFloat(rippleStates[i].HighLimit.value) > 0 && Number.parseFloat(rippleStates[i].LowLimit.value) == 0)
            issuer = rippleStates[i].LowLimit.issuer;
          else if(Number.parseFloat(rippleStates[i].LowLimit.value) > 0 && Number.parseFloat(rippleStates[i].HighLimit.value) == 0)
            issuer = rippleStates[i].HighLimit.issuer;
          else 
            issuer = null; //can not determine issuer!
        }

        if(issuer != null) {

          amount = amount < 0 ? amount * -1 : amount;
          let issuerKey = issuer + "_" + currency;            
  
          if(amount >= 0) {

            //only resolve date from issuer which have actually issued some amount
            if(amount > 0 && !dateResolved && !this.tokenCreation.isTokenInCache(issuerKey)) {
              //make it asynchronous!
              console.log("RESOLVING TOKEN CREATION DATE FOR: " + issuerKey);
              this.tokenCreation.resolveTokenCreationDateFromXrplorer(issuer, currency);
              dateResolved = true;
            }

            //console.log("issuer: " + issuer);
            //console.log("balance: " + amount);
  
            await this.addIssuer(issuerKey, amount, load1);
          }
        }
      }

      let offers:any[] = ledgerState.filter(element => element.LedgerEntryType === 'Offer');

      for(let j = 0; j < offers.length; j++) {
        //check taker gets first
        let takerGets = offers[j].TakerGets
        if(takerGets.currency) {
          //we are an issued currency so add offer to the list
          let issuer:string = takerGets.issuer;
          let currency:string = takerGets.currency;

          await this.increaseOfferCount(issuer+"_"+currency, load1);
        }

        let takerPays:any = offers[j].TakerPays
        if(takerPays.currency) {
          //we are an issued currency so add offer to the list
          let issuer:string = takerPays.issuer;
          let currency:string = takerPays.currency;

          await this.increaseOfferCount(issuer+"_"+currency, load1);
        }

      }
    }
    
    private async addIssuer(issuer:string, amount:number, load1:boolean): Promise<void> {
      if(this.hasIssuer(issuer, load1)) {
          this.addExistingIssuer(issuer, amount, load1);
      } else {
        if(amount > 0) { //only add issuer if he actually has issued the token -> do not add zero balance trustlines
          this.addNewIssuer(issuer, amount, 1, 0,load1);
          //initialize user name to have faster access later on
          await this.accountInfo.resolveKycStatus(issuer.substring(0, issuer.indexOf("_")));
          await this.accountInfo.initAccountName(issuer.substring(0, issuer.indexOf("_")));
        }
      }
    }
    
    private hasIssuer(issuer: string, load1:boolean) : boolean {
      if(load1)
        return this.issuers_1.has(issuer);
      else
        return this.issuers_2.has(issuer);
    }
    
    private addNewIssuer(issuer:string, amount: number, trustlines: number, offers: number, load1:boolean): void {
      if(load1)
          this.issuers_1.set(issuer, {amount: amount, trustlines: trustlines, offers: offers});
      else
          this.issuers_2.set(issuer, {amount: amount, trustlines: trustlines, offers: offers});
    }
    
    private getIssuerData(issuer:string, load1:boolean): IssuerData {
      if(load1)
        return this.issuers_1.get(issuer);
      else
        return this.issuers_2.get(issuer);
    }
    
    private addExistingIssuer(issuer: string, amount:number, load1:boolean) {
      let issuerData:IssuerData = this.getIssuerData(issuer, load1);
      let newAmount = issuerData.amount + amount
      //console.log("setting issuer old");
      this.addNewIssuer(issuer, newAmount, ++issuerData.trustlines, issuerData.offers, load1);
    }

    private increaseOfferCount(issuer: string, load1: boolean) {
      if(this.hasIssuer(issuer, load1)) {
        let issuerData:IssuerData = this.getIssuerData(issuer, load1);
        //console.log("setting issuer old");
        this.addNewIssuer(issuer, issuerData.amount, issuerData.trustlines, ++issuerData.offers, load1);
      } else {
        this.addNewIssuer(issuer, 0, 0, 1, load1);
      }
    }
  

  public getIssuer_1():Map<string, IssuerData> {
    return this.issuers_1;
  }

  public getIssuer_2():Map<string, IssuerData> {
    return this.issuers_2;
  }

  public clearIssuer(load1:boolean) {
    if(load1)
      this.issuers_1.clear();
    else
      this.issuers_2.clear();
  }

    private setIssuers(issuers: Map<string, IssuerData>, load1:boolean): void{
      if(load1)
        this.issuers_1 = new Map(issuers);
      else
        this.issuers_2 = new Map(issuers);
    }

    public saveBithompNamesToFS(): Promise<void> {
      return this.accountInfo.saveBithompUserNamesToFS();
    }

    public saveKycDataToFS(): Promise<void> {
      return this.accountInfo.saveKycDataToFS();
    }

    public async saveIssuerDataToFS(load1:boolean): Promise<void> {
        let mapToSave:Map<string, IssuerData> = new Map(load1 ? this.issuers_1 : this.issuers_2);
        if(mapToSave && mapToSave.size > 0) {
            let issuerData:any = {
              "ledger_index": this.ledgerScanner.getLedgerIndexNew(),
              "ledger_date": this.ledgerScanner.getLedgerCloseTimeNew(),
              "ledger_time_ms": this.ledgerScanner.getLedgerCloseTimeMsNew(),
              "ledger_hash": this.ledgerScanner.getLedgerHashNew(),
              "issuers": {

              }
            };

            mapToSave.forEach((value, key, map) => {
                issuerData["issuers"][key] = value;
            });

            fs.writeFileSync("./../issuerData_new.js", JSON.stringify(issuerData));
            fs.renameSync("./../issuerData_new.js", "./../issuerData.js");

            console.log("saved " + mapToSave.size + " issuer data to file system");
        } else {
          console.log("issuer data is empty!");
        }
    }

    private async loadIssuerDataFromFS(load1:boolean): Promise<void> {
      try {
        console.log("loading issuer data from FS");
        let loadedMap:Map<string, IssuerData> = new Map();
        if(fs.existsSync("./../issuerData.js")) {
            let issuerData:any = JSON.parse(fs.readFileSync("./../issuerData.js").toString());
            if(issuerData) {
                let issuers = issuerData.issuers;
                for (var account in issuers) {
                    if (issuers.hasOwnProperty(account)) {
                        if(!issuers[account].offers)
                          issuers[account].offers = 0;

                        loadedMap.set(account, issuers[account]);
                    }
                }

                console.log("loaded " + loadedMap.size + " issuer data from file system");

                this.ledgerScanner.setLedgerIndex(issuerData['ledger_index']);
                this.ledgerScanner.setLedgerCloseTime(issuerData['ledger_date']);
                this.ledgerScanner.setLedgerCloseTimeMs(issuerData['ledger_time_ms']);
                this.ledgerScanner.setLedgerHash(issuerData['ledger_hash']);
                this.setIssuers(loadedMap, load1);
            }
        } else {
          console.log("issuer data file does not exist yet.")
        }
      } catch(err) {
        console.log("error reading issuer data from FS");
        console.log(err);
        this.setIssuers(new Map(), load1);
      }  
    }
}