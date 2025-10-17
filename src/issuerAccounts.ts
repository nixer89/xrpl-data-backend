import * as fs from 'fs';
import { AccountNames } from './accountNames';
import { IssuerData } from "./util/types"
import { LedgerScanner } from './ledgerScanner';
import { DATA_PATH } from './util/config';

require("log-timestamp");

export class IssuerAccounts {

    private static _instance: IssuerAccounts;
    
    private accountInfo:AccountNames;

    private issuers: Map<string, IssuerData> = new Map();

    private current_ledger_index: number;
    private current_ledger_date: string;
    private current_ledger_time_ms: number;
    private current_ledger_hash: string;

    private constructor() { }

    public static get Instance(): IssuerAccounts
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async init(): Promise<void> {
        this.accountInfo = AccountNames.Instance;

        await this.accountInfo.init();
    }

    public async resolveIssuerToken(ledgerState:any): Promise<void> {   

      let rippleStates:any[] = ledgerState.filter(element => element.LedgerEntryType === 'RippleState');

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

        if(issuer != null && issuer != 'rhrFfvzZAytd8UHPH87UHMgHQ18nnLbpgN' && issuer != "rG9Fo4mgx5DEZp7zKUEchs3R3jSMbx3NhR" && issuer != "rfpzfcK67GNnptw9Z8P7cjx5B7zhu1zv1e") {  //remove gatehub issuer for SGB on their request and LCC fake issuer and old, unsued XPmarket token

          amount = amount < 0 ? amount * -1 : amount;
          let issuerKey = issuer + "_" + currency;
  
          if(amount >= 0) {

            //console.log("issuer: " + issuer);
            //console.log("balance: " + amount);
  
            await this.addIssuer(issuerKey, amount);
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

          await this.increaseOfferCount(issuer+"_"+currency);
        }

        let takerPays:any = offers[j].TakerPays
        if(takerPays.currency) {
          //we are an issued currency so add offer to the list
          let issuer:string = takerPays.issuer;
          let currency:string = takerPays.currency;

          await this.increaseOfferCount(issuer+"_"+currency);
        }
      }
    }
    
    private async addIssuer(issuer:string, amount:number): Promise<void> {
      if(this.hasIssuer(issuer)) {

        if(this.getIssuerData(issuer).amount == 0 && amount > 0) {
          //initialize user name to have faster access later on
          await this.resolveIssuerInfos(issuer);
        }

        this.addExistingIssuer(issuer, amount);
      } else {
        // add issuer now but remove him later if the issued value is 0!
        this.addNewIssuer(issuer, amount, 1, 0, 1);

        if(amount > 0) {
          //initialize user name to have faster access later on
          await this.resolveIssuerInfos(issuer);
        }
      }
    }

    private async resolveIssuerInfos(issuer): Promise<void> {
      await this.accountInfo.resolveKycStatus(issuer.substring(0, issuer.indexOf("_")));
      //await this.accountInfo.initAccountName(issuer.substring(0, issuer.indexOf("_")));
    }
    
    private hasIssuer(issuer: string) : boolean {
        return this.issuers.has(issuer);
    }
    
    private addNewIssuer(issuer:string, amount: number, trustlines: number, offers: number, holders:number): void {
          this.issuers.set(issuer, {amount: amount, trustlines: trustlines, offers: offers, holders: holders});
    }
    
    private getIssuerData(issuer:string): IssuerData {
        return this.issuers.get(issuer);
    }
    
    private addExistingIssuer(issuer: string, amount:number) {
      let issuerData:IssuerData = this.getIssuerData(issuer);
      let newAmount = issuerData.amount + amount
      //console.log("setting issuer old");
      this.addNewIssuer(issuer, newAmount, ++issuerData.trustlines, issuerData.offers, (amount > 0 ? ++issuerData.holders : issuerData.holders));
    }

    private increaseOfferCount(issuer: string) {
      if(this.hasIssuer(issuer)) {
        let issuerData:IssuerData = this.getIssuerData(issuer);
        //console.log("setting issuer old");
        this.addNewIssuer(issuer, issuerData.amount, issuerData.trustlines, ++issuerData.offers, issuerData.holders);
      } else {
        this.addNewIssuer(issuer, 0, 0, 1, 0);
      }
    }
  

  public getIssuer():Map<string, IssuerData> {
    return this.issuers;
  }

  public clearIssuer() {
      this.issuers.clear();
      this.accountInfo.resetResolveCounters();
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

    public saveKycDataToFS(): Promise<void> {
      return this.accountInfo.saveKycDataToFS();
    }

    public async saveIssuerDataToFS(): Promise<void> {
      try {
        let mapToSave:Map<string, IssuerData> = new Map(this.issuers);
        if(mapToSave && mapToSave.size > 0) {
            let issuerData:any = {
              ledger_index: this.getCurrentLedgerIndex(),
              ledger_hash: this.getCurrentLedgerHash(),
              ledger_close: this.getCurrentLedgerCloseTime(),
              ledger_close_ms: this.getCurrentLedgerCloseTimeMs(),
              issuers: {}
            };

            mapToSave.forEach((value, key, map) => {
                if(value.amount > 0)
                  issuerData["issuers"][key] = value;
            });

            fs.writeFileSync(DATA_PATH+"issuerData_new.js", JSON.stringify(issuerData));
            fs.renameSync(DATA_PATH+"issuerData_new.js", DATA_PATH+"issuerData.js");

            console.log("saved " + mapToSave.size + " issuer data to file system");
        } else {
          console.log("issuer data is empty!");
        }
      } catch(err) {
        console.log(err);
      }
    }
}