import * as config from './util/config';
import * as scheduler from 'node-schedule';
import consoleStamp = require("console-stamp");
import { IssuerAccounts } from './issuerAccounts';
import { LedgerData } from './ledgerData';
import * as binaryCodec from 'ripple-binary-codec'
import { Call, XrplClient } from 'xrpl-client';
import HttpsProxyAgent = require("https-proxy-agent");
import { AdaptedLedgerObject } from './util/types';


consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class LedgerScanner {

    private static _instance: LedgerScanner;

    private useProxy = config.USE_PROXY;

    private load1: boolean = true;

    private xrplClient:XrplClient;

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

    private proxyAgent:HttpsProxyAgent = new HttpsProxyAgent(config.PROXY_URL);

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

        //await this.readLedgerData(null, null, null, 0);

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
      
      
        let ledger_data_command:Call = {
          command: "ledger_data",
          limit: 100000,
          binary: true
        }
      
        if(ledgerIndex)
          ledger_data_command.ledger_index = ledgerIndex;
        else
          ledger_data_command.ledger_index = "validated";
      
        if(marker)
          ledger_data_command.marker = marker;
      
        try { 
          if(!this.xrplClient || !this.xrplClient.getState().online) {
            if(this.useProxy)
                this.xrplClient = new XrplClient("wss://xrplcluster.com", {httpRequestOptions: { agent: this.proxyAgent }, assumeOfflineAfterSeconds: 120});
            else
                this.xrplClient = new XrplClient("ws://127.0.0.1:6006", {assumeOfflineAfterSeconds: 120});
      
            try {
              await this.xrplClient.ready();
              console.log("connected to: " + this.xrplClient.getState().server);
              //console.log(JSON.stringify(this.xrplClient.getState()));
              //console.log(JSON.stringify(await this.xrplClient.send({command: "", "__api":"state"})));
            } catch(err) {
              return this.readLedgerData(ledgerIndex, marker, marker, retryCounter);
            }
          }
      
          //console.log("ws://127.0.0.1:6006");
          //console.log("calling with: " + JSON.stringify(ledger_data_command));
          console.time("requesting binary");
          let messageBinary = await this.xrplClient.send(ledger_data_command);
          console.timeEnd("requesting binary");
      
          console.log("length: " + messageBinary.state.length);
          //console.log("got response: " + JSON.stringify(message).substring(0,1000));

          //console.log(JSON.stringify(await this.xrplClient.send({command: "", "__api":"state"})));
      
          if(messageBinary && messageBinary.state && messageBinary.ledger_index) {
            let newledgerIndex:string = messageBinary.ledger_index;
            let newMarker:string = messageBinary.marker;
      
            console.log("marker: " + newMarker);
            //console.log("ledger_index: " + newledgerIndex);

            console.time("resolveLedgerData binary");
            await this.ledgerData.resolveLedgerData(messageBinary.state, this.load1);
            console.timeEnd("resolveLedgerData binary");

            console.time("requesting json");
            ledger_data_command.binary = false;
            let messageJson = await this.xrplClient.send(ledger_data_command);
            console.timeEnd("requesting json");

            if(messageJson && messageJson.state && messageJson.ledger_index && messageBinary.ledger_index) {
              console.time("resolveIssuerToken");
              await this.issuerAccount.resolveIssuerToken(messageJson.state, this.load1);
              console.timeEnd("resolveIssuerToken");
            }
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
                
          let ledgerInfo = await this.xrplClient.send({command: "ledger", ledger_index: ledgerIndex});
      
          this.setLedgerIndex(ledgerIndex);
          this.setLedgerHash(ledgerInfo.ledger_hash);
          this.setLedgerCloseTime(ledgerInfo.ledger.close_time_human);
          this.setLedgerCloseTimeMs(ledgerInfo.ledger.close_time);

          //always save resolved user names to file system to make restart of server much faster
          setTimeout(() => this.issuerAccount.saveBithompNamesToFS(), 10000);
          await this.issuerAccount.saveIssuerDataToFS(this.load1);
          await this.ledgerData.saveLedgerDataToFS(this.load1);
    
          return true;
      
        } catch(err) {
          console.log(err);
          
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