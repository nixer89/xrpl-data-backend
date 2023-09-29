import * as scheduler from 'node-schedule';
import * as fetch from 'node-fetch';
import { IssuerAccounts } from './issuerAccounts';
import { LedgerData } from './ledgerData';
import { Client, LedgerDataRequest, LedgerDataResponse, LedgerRequest, LedgerResponse,  } from 'xrpl';
import { NftIssuerAccounts } from './nftIssuerAccounts';
import { SupplyInfo } from './supplyInfo';
import { SCHEDULE_MINUTE } from './util/config';

require("log-timestamp");

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
    private supplyInfo: SupplyInfo;

    private runs = -1;

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
        this.supplyInfo = SupplyInfo.Instance;

        await this.issuerAccount.init();
        await this.supplyInfo.init();

        await this.readLedgerData(null, null, null, 0);

        //check if we can start right now
        let currentDate = new Date();
        currentDate.setSeconds(0);
        currentDate.setMilliseconds(0);

        let diff = currentDate.getMinutes() - SCHEDULE_MINUTE;

        if(diff >=1 && diff < 15) //only start if withing the first 15 minutes of schedule
          await this.readLedgerData(null, null, null, 0);

        scheduler.scheduleJob("readIssuedToken", {minute: (SCHEDULE_MINUTE+1)}, () => this.scheduleLoadingIssuerData());
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
            this.nftIssuerAccounts.clearData();
            this.issuerAccount.clearIssuer();
            this.ledgerData.clearLedgerData();
            this.supplyInfo.clearSupplyInfo();
          } else {
            console.log("loading ledger data not successfull.")
          }

          this.isRunning = false;
        } catch(err) {
          console.log(err);
          console.log("not cought error when running the scan. stopping.")
          this.isRunning = false;
        }
      }
    }

     public async readLedgerData(ledgerIndex:number, marker:unknown, oldMarker:unknown, retryCounter:number): Promise<boolean> {
        this.runs++;
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
        //console.log("new call: marker: " + marker);

        try {
          if(!ledgerIndex) { //no ledger index given. resolve latest ledger at exact matching time!
            let time = new Date();
            time.setMinutes(SCHEDULE_MINUTE);
            time.setSeconds(0);
            time.setMilliseconds(0);

            console.log("getting ledger index with:")
            console.log("https://data.xrplf.org/v1/ledgers/ledger_index?date="+time.toISOString());

            let ledgerResponse = await fetch.default("https://data.xrplf.org/v1/ledgers/ledger_index?date="+time.toISOString());

            if(ledgerResponse && ledgerResponse.ok) {
              let responseJson = await ledgerResponse.json();

              console.log("got response:")
              console.log(JSON.stringify(responseJson));

              if(responseJson && responseJson.ledger_index) {
                ledgerIndex = responseJson.ledger_index;
                console.log("set ledger index to: " + ledgerIndex);

                let tmpClient = new Client("ws://127.0.0.1:6006");
                await tmpClient.connect();
                //check if the node has the ledger
                let ledger_info_request:LedgerRequest = {
                  command: 'ledger',
                  ledger_index: ledgerIndex,
                  full: false,
                  expand: false
                }

                let ledger_info_response = await tmpClient.request(ledger_info_request);

                if(!ledger_info_response || !ledger_info_response.result || ledger_info_response.result.ledger_index != ledgerIndex) {
                  ledgerIndex = null;
                }
              }
            }
          }
        } catch(err) {
          console.log("cannot read ledger index or ledger index too old. use 'validated'!");
          ledgerIndex = null;
        }

        if(!marker) {
            this.issuerAccount.clearIssuer();
            this.nftIssuerAccounts.clearData();
            this.ledgerData.clearLedgerData();
            this.supplyInfo.clearSupplyInfo();
            this.setLedgerCloseTime(null)
            this.setLedgerCloseTimeMs(null);
            this.setLedgerIndex(null);
            this.setLedgerHash(null);
        }
      
        let ledger_data_command_binary:LedgerDataRequest = {
          command: "ledger_data",
          limit: this.runs < 32 ? 100000 : 50000,
          binary: true
        }
    

        let ledger_data_command_json:LedgerDataRequest = {
          command: "ledger_data",
          limit: this.runs < 32 ? 100000 : 50000,
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
                this.xrpljsClient.on('error', error => {
                  console.log(error);
                });
              } catch(err) {
                console.log(err);
              }
      
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

              await this.supplyInfo.collectSupplyInfo(messageBinary.result.state);
            } else {
              throw "binary and json objects not the same!"
            }
            //console.log("done");
      
            //console.log("issuer size: " + this.issuerAccount.getIssuer().size);
            //console.log("nft size: " + this.nftIssuerAccounts.getNFTMap().size);

            if(newledgerIndex != null && newMarker != null) {
              return this.readLedgerData(newledgerIndex, newMarker, marker, retryCounter);
            } else {
              console.log("ALL DONE");
              console.log("issuer size: " + this.issuerAccount.getIssuer().size);
              console.log("nft size: " + this.nftIssuerAccounts.getNFTMap().size);
            }
          } else {
            console.log("ALL DONE");
            console.log("issuer size: " + this.issuerAccount.getIssuer().size);
            console.log("nft size: " + this.nftIssuerAccounts.getNFTMap().size);
          }
      
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
          //await this.issuerAccount.saveBithompNamesToFS();

          await this.ledgerData.saveLedgerDataToFS();

          this.nftIssuerAccounts.setCurrentLedgerIndex(ledgerIndex);
          this.nftIssuerAccounts.setCurrentLedgerHash(ledgerInfo.result.ledger_hash);
          this.nftIssuerAccounts.setCurrentLedgerCloseTime(ledgerInfo.result.ledger.close_time_human);
          this.nftIssuerAccounts.setCurrentLedgerCloseTimeMs(ledgerInfo.result.ledger.close_time);

          await this.nftIssuerAccounts.saveNFTDataToFS();

          this.supplyInfo.setCurrentLedgerIndex(ledgerIndex);
          this.supplyInfo.setCurrentLedgerCloseTime(ledgerInfo.result.ledger.close_time_human);

          await this.supplyInfo.calculateSupplyAndSave();

          
          await this.issuerAccount.saveKycDataToFS();
          await this.issuerAccount.saveIssuerDataToFS();

          /**
          //trigger online delete
          let canDeleteResponse = await this.xrpljsClient.request({
            command: 'can_delete',
            can_delete: 'now'
          });

          console.log(JSON.stringify(canDeleteResponse));
          **/
         
          return true;
      
        } catch(err) {
          console.log("err retrieving data. trying again with same marker.")
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