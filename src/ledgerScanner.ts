import * as scheduler from 'node-schedule';
import consoleStamp = require("console-stamp");
import { IssuerAccounts } from './issuerAccounts';
import { LedgerData } from './ledgerData';
import { Client, LedgerDataRequest, LedgerDataResponse, LedgerRequest, LedgerResponse,  } from 'xrpl';
import { NftIssuerAccounts } from './nftIssuerAccounts';

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class LedgerScanner {

    private static _instance: LedgerScanner;

    private isRunning:boolean = false;

    //private xrplClient:XrplClient;

    private xrpljsClient:Client;

    private ledger_index: number;
    private ledger_date: string;
    private ledger_time_ms: number;
    private ledger_hash: string;

    private issuerAccount:IssuerAccounts;
    private ledgerData:LedgerData;
    private nftIssuerAccounts: NftIssuerAccounts;

    private constructor() {}

    public static get Instance(): LedgerScanner
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async init(): Promise<void> {
        this.issuerAccount = IssuerAccounts.Instance;
        this.ledgerData = LedgerData.Instance;
        this.nftIssuerAccounts = NftIssuerAccounts.Instance;

        await this.issuerAccount.init();

        await this.readLedgerData(null, null, null, 0);

        scheduler.scheduleJob("readIssuedToken", {minute: 0}, () => this.scheduleLoadingIssuerData());
        scheduler.scheduleJob("readIssuedToken", {minute: 30}, () => this.scheduleLoadingIssuerData());
        console.log("started ledger scan schedule. Waiting now.");
    }

    async scheduleLoadingIssuerData(): Promise<void> {
      //only let the tool run when it is currently NOT running or else weird stuff happens!
      if(!this.isRunning) {
        
        this.isRunning = true;
        try {
          let success:boolean = await this.readLedgerData(null, null, null, 0);
          if(success) {
            console.log("loading ledger data successfull.")
          } else {
            console.log("loading ledger data not successfull.")
          }

          this.isRunning = false;
        } catch(err) {
          console.log(err);
          this.isRunning = false;
        }
      }
    }

    public async readLedgerData(ledgerIndex:number, marker:unknown, oldMarker:unknown, retryCounter:number): Promise<boolean> {
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
            this.issuerAccount.clearIssuer();
            this.ledgerData.clearLedgerData();
            this.setLedgerCloseTime(null)
            this.setLedgerCloseTimeMs(null);
            this.setLedgerIndex(null);
            this.setLedgerHash(null);
        }
      
        let ledger_data_command_binary:LedgerDataRequest = {
          command: "ledger_data",
          limit: 100000,
          binary: true
        }
    

        let ledger_data_command_json:LedgerDataRequest = {
          command: "ledger_data",
          limit: 100000,
          binary: false
        }
      
        if(ledgerIndex && typeof(ledgerIndex) === "number")
          ledger_data_command_binary.ledger_index = ledgerIndex;
        else
          ledger_data_command_binary.ledger_index = "validated";
      
        if(marker)
          ledger_data_command_binary.marker = ledger_data_command_json.marker = marker;
      
        try { 
          if(!this.xrpljsClient || !this.xrpljsClient.isConnected()) {
              this.xrpljsClient = new Client("ws://127.0.0.1:6006");
              //this.xrpljsClient = new Client("wss://xrplcluster.com");
      
            try {
              await this.xrpljsClient.connect();
              console.log("connected: " + JSON.stringify(this.xrpljsClient.isConnected()));
              //console.log(JSON.stringify(this.xrplClient.getState()));
              //console.log(JSON.stringify(await this.xrplClient.send({command: "", "__api":"state"})));
            } catch(err) {
              return this.readLedgerData(ledgerIndex, marker, marker, retryCounter);
            }
          }
      
          //console.log("ws://127.0.0.1:6006");
          //console.log("calling with: " + JSON.stringify(ledger_data_command));
          //console.time("requesting binary");
          //console.log("requesting with: " + JSON.stringify(ledger_data_command_binary))
          let messageBinary:LedgerDataResponse = await this.xrpljsClient.request(ledger_data_command_binary);
          //console.log("length binary: " + messageBinary.result.state.length);
          //console.timeEnd("requesting binary");
                
          //console.log("got response: " + JSON.stringify(message).substring(0,1000));

          //console.log(JSON.stringify(await this.xrplClient.send({command: "", "__api":"state"})));
      
          if(messageBinary && messageBinary.result && messageBinary.result.state && messageBinary.result.ledger_index) {
            let newledgerIndex:number = messageBinary.result.ledger_index;
            //console.log("marker: " + messageBinary.result.marker);
            let newMarker:unknown = messageBinary.result.marker;

            //console.log("newMarker: " + newMarker);
            //console.log("ledger_index: " + newledgerIndex);

            ledger_data_command_json.ledger_index = newledgerIndex;          

            //console.time("requesting json");
            //console.log("requesting with: " + JSON.stringify(ledger_data_command_json))
            let messageJson:LedgerDataResponse = await this.xrpljsClient.request(ledger_data_command_json);
            //console.log("length json: " + messageJson.result.state.length);
            //console.timeEnd("requesting json");

            if(messageJson && messageJson.result && messageJson.result.state && messageJson.result.ledger_index == messageBinary.result.ledger_index && messageBinary.result.state.length == messageJson.result.state.length && messageBinary.result.marker == messageJson.result.marker) {

              for(let i = 0; i < messageBinary.result.state.length; i++) {
                try {
                  if(messageBinary.result.state[i].index == messageJson.result.state[i].index)
                    messageBinary.result.state[i]['parsed'] = messageJson.result.state[i];
                  else {
                    console.log("####### NOT SAME INDEX!!! ###########")
                    console.log("BINARY: " + messageBinary.result.state[i].index);
                    console.log("JSON  : "  + messageJson.result.state[i].index)
                  }
                } catch(err) {
                  console.log(err);
                  console.log("binary: " + JSON.stringify(messageBinary.result.state[i]));
                  console.log("json: " + JSON.stringify(messageJson.result.state[i]));
                  return;
                }
              }

              //console.time("resolveLedgerData binary");
              await this.ledgerData.resolveLedgerData(messageBinary.result.state);
              //console.timeEnd("resolveLedgerData binary");
              
              //console.time("resolveIssuerToken");
              await this.issuerAccount.resolveIssuerToken(messageJson.result.state);
              //console.timeEnd("resolveIssuerToken");

              await this.nftIssuerAccounts.resolveNFToken(messageJson.result.state);
            } else {
              throw "binary and json objects not the same!"
            }
            //console.log("done");
      
            console.log("issuer size: " + this.issuerAccount.getIssuer().size);
            console.log("nft size: " + this.nftIssuerAccounts.getNFTMap().size);

            if(newledgerIndex != null && newMarker != null) {
              return this.readLedgerData(newledgerIndex, newMarker, marker, retryCounter);
            } else {
              console.log("Done 1");
              console.log("issuer size: " + this.issuerAccount.getIssuer().size);
              console.log("nft size: " + this.nftIssuerAccounts.getNFTMap().size);
            }
          } else {
            console.log("Done 2");
            console.log("issuer size: " + this.issuerAccount.getIssuer().size);
            console.log("nft size: " + this.nftIssuerAccounts.getNFTMap().size);
          }
      
          console.log("ALL DONE");

          let ledgerCommand:LedgerRequest = {
            command: "ledger",
            ledger_index: ledgerIndex
          }
                
          let ledgerInfo:LedgerResponse = await this.xrpljsClient.request(ledgerCommand);
      
          this.setLedgerIndex(ledgerIndex);
          this.setLedgerHash(ledgerInfo.result.ledger_hash);
          this.setLedgerCloseTime(ledgerInfo.result.ledger.close_time_human);
          this.setLedgerCloseTimeMs(ledgerInfo.result.ledger.close_time);

          //always save resolved user names to file system to make restart of server much faster
          await this.issuerAccount.saveBithompNamesToFS();
          await this.issuerAccount.saveKycDataToFS();
          await this.issuerAccount.saveIssuerDataToFS();
          await this.nftIssuerAccounts.saveNFTDataToFS();
          await this.ledgerData.saveLedgerDataToFS();
          
          //trigger online deletion
          //await this.xrpljsClient.request({command: "can_delete", can_delete: "now"});
    
          return true;
      
        } catch(err) {
          console.log(err);
          
          if(marker != null || (marker == null && ledgerIndex == null))
            return this.readLedgerData(ledgerIndex, marker, marker, retryCounter);
          else
            return false;
        }
      }
    
      public getLedgerIndex(): number {
        return this.ledger_index;
    }

    public setLedgerIndex(index:number): void {
        this.ledger_index = index;
    }

    public getLedgerHash(): string {
        return this.ledger_hash;
    }

    public setLedgerHash(hash:string): void {
        this.ledger_hash = hash;
    }

    public getLedgerCloseTime(): string {
        return this.ledger_date;
    }

    public setLedgerCloseTime(closeTime: string): void {
        this.ledger_date = closeTime;
    }

    public getLedgerCloseTimeMs(): number {
        return this.ledger_time_ms;
    }

    public setLedgerCloseTimeMs(closeTimeInMs: number): void {
        this.ledger_time_ms = closeTimeInMs;
    }
}