import * as fs from 'fs';
import { XrplClient } from 'xrpl-client';
import * as config from './util/config';
import HttpsProxyAgent = require("https-proxy-agent");

export class OfferData {

    private static _instance: OfferData;

    private proxyAgent:HttpsProxyAgent = new HttpsProxyAgent(config.PROXY_URL);
    private useProxy = config.USE_PROXY;

    private offerData_1: any = {};
    private offerData_2: any = {};

    private offerToAdd:Map<string, any> = new Map();
    private offerToRemove:Map<string, any> = new Map();

    private xrplClient_1:XrplClient;
    private xrplClient_2:XrplClient;

    private constructor() { }

    public static get Instance(): OfferData
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async init(load1:boolean): Promise<void> {
        await this.loadofferDataFromFS(load1);
    }

    public async subscribeForTransactions(load1: boolean): Promise<number> {
      try { 
        if(!this.getXrplClient(load1) || !this.getXrplClient(load1).getState().online) {
          if(this.useProxy)
              this.setXrplClient(load1,new XrplClient("wss://xrplcluster.com", {httpRequestOptions: { agent: this.proxyAgent }, assumeOfflineAfterSeconds: 120}));
          else
              this.setXrplClient(load1, new XrplClient("ws://127.0.0.1:6006", {assumeOfflineAfterSeconds: 120}));
    
          try {
            await this.getXrplClient(load1).ready();
            console.log("connected to: " + JSON.stringify(this.getXrplClient(load1).getState().server));
            //console.log(JSON.stringify(this.xrplClient.getState()));
            //console.log(JSON.stringify(await this.xrplClient.send({command: "", "__api":"state"})));

            let lastClosedLedger:any = this.getXrplClient(load1).send({"command": "ledger_closed"});

            this.getXrplClient(load1).on('transaction', transaction => {
              if("closed" == transaction.status && "transaction" == transaction.type && "tesSUCCESS" == transaction.engine_result) {
                if(transaction.transaction.LedgerEntryType == "OfferCreate" || transaction.transaction.LedgerEntryType == "OfferCancel") {
                  
                }
              }
            });

            return lastClosedLedger.result.ledger_index;

          } catch(err) {
          }

          return null;
        }
        return null;
      } catch(err) {
        console.log()
      }
      return null;

    }

    public getXrplClient(load1:boolean) {
      if(load1)
        return this.xrplClient_1;
      else
        return this.xrplClient_2;
    }

    public setXrplClient(load1:boolean, client:XrplClient) {
      if(load1)
        this.xrplClient_1 = client;
      else
        this.xrplClient_2 = client;
    }

    public async resolveOfferData(ledgerState:any, load1:boolean, isNewRequest?: boolean): Promise<void> {

      if(isNewRequest) {
        this.offerToAdd.clear();
        this.offerToRemove.clear();
      }

      let offers:any[] = ledgerState.filter(element => element.LedgerEntryType === 'Offer');

      for(let i = 0; i < offers.length; i++) {
          let takerGets:string = offers[i].TakerGets.currency ? (offers[i].TakerGets.currency+offers[i].TakerGets.issuer) : 'XRP';
          let takerPays:string = offers[i].TakerPays.currency ? (offers[i].TakerPays.currency+offers[i].TakerPays.issuer) : 'XRP';

          if(this.getOfferData(load1)[takerGets+"/"+takerPays]) {
            //add entry to existing one
            this.getOfferData(load1)[takerGets+"/"+takerPays].set(offers[i].index, offers[i]);
            
          } else {
            //create new entry
            let newMap:Map<string, any> = new Map();
            newMap.set(offers[i].index ,offers[i]);

            this.getOfferData(load1)[takerGets+"/"+takerPays] = newMap;
          }
      }
      console.log(JSON.stringify(this.getOfferData(load1)));
    }

    public getOfferData(load1: boolean) {
        if(load1)
            return this.offerData_1;
        else
            return this.offerData_2;
    }

    public getOfferDataV1(load1: boolean): any[] {
      let dataToUse = JSON.parse(JSON.stringify(load1 ? this.offerData_2 : this.offerData_1))
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

    public clearOfferData(load1: boolean) {
        if(load1)
            this.offerData_1 = {};
        else
            this.offerData_2 = {};
    }

    private setOfferData(offerData: any, load1:boolean): void{
        if(load1)
          this.offerData_1 = offerData;
        else
          this.offerData_2 = offerData;
      }

    public async saveOfferDataToFS(load1:boolean): Promise<void> {
        let offerDataToSave:string = JSON.stringify(load1 ? this.offerData_1 : this.offerData_2);
        if(offerDataToSave && offerDataToSave.length > 0) {

            fs.writeFileSync("./../offerData.js", offerDataToSave);

            console.log("saved offer data to file system");
        } else {
          console.log("offer data is empty! Nothing saved");
        }
    }

    private async loadofferDataFromFS(load1:boolean): Promise<void> {
      try {
        console.log("loading ledger data from FS");
        if(fs.existsSync("./../offerData.js")) {
            let offerData:any = JSON.parse(fs.readFileSync("./../offerData.js").toString());
            if(offerData) {
                //console.log("ledger data loaded: " + JSON.stringify(offerData));
                this.setOfferData(offerData, load1);
            }
        } else {
          console.log("offer data file does not exist yet.")
        }
      } catch(err) {
        console.log("error reading issuer data from FS");
        console.log(err);
        this.setOfferData({}, load1);
      }  
    }
}