import * as config from './util/config';
import * as ripple from 'ripple-lib';
import * as scheduler from 'node-schedule';
import { LedgerDataRequest, LedgerDataResponse, LedgerResponse } from 'ripple-lib';
import consoleStamp = require("console-stamp");
import { IssuerAccounts } from './issuerAccounts';
import { LedgerData } from './ledgerData';
import * as binaryCodec from 'ripple-binary-codec'


consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class LedgerScanner {

    private static _instance: LedgerScanner;

    private useProxy = config.USE_PROXY;

    private load1: boolean = true;

    private websocket:ripple.RippleAPI;

    private ledger_index_1: string;
    private ledger_index_2: string;
    private ledger_date_1: string;
    private ledger_date_2: string;
    private ledger_time_ms_1: number;
    private ledger_time_ms_2: number;
    private ledger_hash_1: string;
    private ledger_hash_2: string;

    private issuerAccount:IssuerAccounts;
    private ledgerData:LedgerData;

    private constructor() {}

    public static get Instance(): LedgerScanner
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public getLoad() {
        return this.load1;
    }

    public async init(): Promise<void> {
        this.issuerAccount = IssuerAccounts.Instance;
        this.ledgerData = LedgerData.Instance;

        await this.issuerAccount.init(this.load1);
        await this.ledgerData.init(this.load1);

        await this.readLedgerData(null, null, null, 0);

        //load issuer data if it could not be read from the file system
        if(this.load1 && this.issuerAccount.getIssuer_1().size == 0 || !this.load1 && this.issuerAccount.getIssuer_1().size == 0) {
            await this.readLedgerData(null, null, null, 0);
        }

        this.load1=!this.load1;

        scheduler.scheduleJob("readIssuedToken", {minute: 0}, () => this.scheduleLoadingIssuerData());
        scheduler.scheduleJob("readIssuedToken", {minute: 30}, () => this.scheduleLoadingIssuerData());
    }

    async scheduleLoadingIssuerData(): Promise<void> {
      let success:boolean = await this.readLedgerData(null, null, null, 0);
      if(success) {
        this.load1=!this.load1;
        console.log("loading ledger data successfull. Maps changed.")
      } else {
        console.log("loading ledger data not successfull. Not changing maps.")
      }
    }

    public async readLedgerData(ledgerIndex:string, marker:string, oldMarker:string, retryCounter:number): Promise<boolean> {
        if(oldMarker && oldMarker == marker || (!marker && !oldMarker)) {
          console.log("increase retry counter");
          retryCounter++;

          if(retryCounter > 4) {
            console.log("giving up for this request.");
            return false;
          }
        } else if(marker != oldMarker) {
          //reset retry counter
          retryCounter = 0;
        }
        //console.log("new call: ledgerIndex: " + ledgerIndex);
        console.log("new call: marker: " + marker);

        if(!marker) {
            this.issuerAccount.clearIssuer(this.load1);
            this.ledgerData.clearLedgerData(this.load1);
            this.setLedgerCloseTime(null)
            this.setLedgerCloseTimeMs(null);
            this.setLedgerIndex(null);
            this.setLedgerHash(null);
        }
      
      
        let ledger_data:LedgerDataRequest = {
          limit: 100000,
          binary: false
        }
      
        if(ledgerIndex)
          ledger_data.ledger_index = ledgerIndex;
      
        if(marker)
          ledger_data.marker = marker;
      
        try { 
          if(!this.websocket || !this.websocket.isConnected()) {
            if(this.useProxy)
                this.websocket = new ripple.RippleAPI({server: "wss://xrplcluster.com", proxy: config.PROXY_URL, timeout: 120000});
            else
                this.websocket = new ripple.RippleAPI({server: "wss://xrplcluster.com", timeout: 120000});
      
            try {
              await this.websocket.connect();
            } catch(err) {
              return this.readLedgerData(ledgerIndex, marker, marker, retryCounter);
            }
          }
      
          //console.log("connected to xrplcluster.com");
          //console.log("calling with: " + JSON.stringify(ledger_data));
              
          console.time("requesting")

          let message:LedgerDataResponse = await this.websocket.request('ledger_data', ledger_data);
      
          console.timeEnd("requesting")

          //console.log("got response: " + JSON.stringify(message).substring(0,1000));
      
          if(message && message.state && message.ledger_index) {
            let newledgerIndex:string = message.ledger_index;
            let newMarker:string = message.marker;
      
            //console.log("marker: " + newMarker);
            //console.log("ledger_index: " + newledgerIndex);

            /** let parsedObjects:any[] = [];

            console.time("parsing")

            for(let i = 0; i < message.state.length; i++) {
              let decoded = binaryCodec.decode(message.state[i].data)
              parsedObjects.push(decoded);
              message.state[i].parsed = decoded;
            }

            console.timeEnd("parsing")

            **/

            console.time("resolveIssuerToken")
            await this.issuerAccount.resolveIssuerToken(message.state, this.load1);
            console.timeEnd("resolveIssuerToken")
            //console.time("resolveLedgerData")
            //await this.ledgerData.resolveLedgerData(message.state, this.load1);
            //console.timeEnd("resolveLedgerData")
      
            //console.log("done");
      
            console.log("issuer_1 size: " + this.issuerAccount.getIssuer_1().size);
            console.log("issuer_2 size: " + this.issuerAccount.getIssuer_2().size);
            if(newledgerIndex != null && newMarker != null)
                return this.readLedgerData(newledgerIndex, newMarker, marker, retryCounter);
            else {
              console.log("Done 1");
              console.log("issuer_1 size: " + this.issuerAccount.getIssuer_1().size);
              console.log("issuer_2 size: " + this.issuerAccount.getIssuer_2().size);
            }
          } else {
            console.log("Done 2");
            console.log("issuer_1 size: " + this.issuerAccount.getIssuer_1().size);
            console.log("issuer_2 size: " + this.issuerAccount.getIssuer_2().size);
          }
      
          console.log("ALL DONE");
                
          let ledgerInfo:LedgerResponse = await this.websocket.request('ledger', {ledger_index: ledgerIndex});
      
          this.setLedgerIndex(ledgerIndex);
          this.setLedgerHash(ledgerInfo.ledger_hash);
          this.setLedgerCloseTime(ledgerInfo.ledger.close_time_human);
          this.setLedgerCloseTimeMs(ledgerInfo.ledger.close_time);

          //always save resolved user names to file system to make restart of server much faster
          setTimeout(() => this.issuerAccount.saveBithompNamesToFS(), 10000);
          await this.issuerAccount.saveIssuerDataToFS(this.load1);
          await this.ledgerData.saveLedgerDataToFS(this.load1);
      
          this.websocket.disconnect();
          this.websocket = null;

          return true;
      
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
            return this.readLedgerData(ledgerIndex, marker, marker, retryCounter);
          else
            return false;
        }
      }
    
      public getLedgerIndex(): string {
        return this.load1 ? this.ledger_index_2 : this.ledger_index_1;
    }

    public getLedgerIndexNew(): string {
      return this.load1 ? this.ledger_index_1 : this.ledger_index_2;
    }

    public setLedgerIndex(index:string): void {
      if(this.load1)
        this.ledger_index_1 = index;
      else
        this.ledger_index_2 = index;
    }

    public getLedgerHash(): string {
        return this.load1 ? this.ledger_hash_2 : this.ledger_hash_1;
    }

    public getLedgerHashNew(): string {
      return this.load1 ? this.ledger_hash_1 : this.ledger_hash_2;
  }

    public setLedgerHash(hash:string): void {
      if(this.load1)
        this.ledger_hash_1 = hash;
      else
        this.ledger_hash_2 = hash;
    }

    public getLedgerCloseTime(): string {
        return this.load1 ? this.ledger_date_2 : this.ledger_date_1;
    }

    public getLedgerCloseTimeNew(): string {
      return this.load1 ? this.ledger_date_1 : this.ledger_date_2;
  }

    public setLedgerCloseTime(closeTime: string): void {
      if(this.load1)
        this.ledger_date_1 = closeTime;
      else
        this.ledger_date_2 = closeTime;
    }

    public getLedgerCloseTimeMs(): number {
        return this.load1 ? this.ledger_time_ms_2 : this.ledger_time_ms_1;
    }

    public getLedgerCloseTimeMsNew(): number {
      return this.load1 ? this.ledger_time_ms_1 : this.ledger_time_ms_2;
  }

    public setLedgerCloseTimeMs(closeTimeInMs: number): void {
      if(this.load1)
        this.ledger_time_ms_1 = closeTimeInMs;
      else
        this.ledger_time_ms_2 = closeTimeInMs;
    }
}