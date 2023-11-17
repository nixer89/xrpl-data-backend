import * as fs from 'fs';
import { URIToken } from './util/types';
import { DATA_PATH } from './util/config';

require("log-timestamp");

export class UriTokenIssuerAccounts {

    private static _instance: UriTokenIssuerAccounts;

    private uriTokenMap: Map<string, URIToken> = new Map();

    private current_ledger_index: number;
    private current_ledger_date: string;
    private current_ledger_time_ms: number;
    private current_ledger_hash: string;

    private constructor() { }

    public static get Instance(): UriTokenIssuerAccounts
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async resolveUriToken(ledgerState:any): Promise<void> {   

      let uriTokens:URIToken[] = ledgerState.filter(element => element.LedgerEntryType === 'URIToken');

      for(let i = 0; i < uriTokens.length; i++) {
        let uriToken = uriTokens[i];
        uriToken.URITokenID = uriToken.index;
        delete uriToken.OwnerNode;
        delete uriToken.PreviousTxnID;
        delete uriToken.PreviousTxnLgrSeq;
        delete uriToken.LedgerEntryType;

        await this.addUriToken(uriTokens[i]);
      }
    }
    
    public async addUriToken(newUriToken:URIToken): Promise<void> {
      this.uriTokenMap.set(newUriToken.URITokenID, newUriToken);
    }

    public getUriToken(uriTokenId:string): URIToken {
      return this.uriTokenMap.get(uriTokenId);
    }

    public getUriTokenMap():Map<string, URIToken> {
      return this.uriTokenMap;
    }

    public clearData() {
        this.uriTokenMap.clear();
    }

    public async saveUriTokenDataToFS(): Promise<void> {
      try {
        let currentWrittenLedger = await this.readCurrentLedgerFromFS();

        if(this.getCurrentLedgerIndex() > currentWrittenLedger) {
          let mapToSave:Map<string, URIToken> = new Map(this.uriTokenMap);
          if(mapToSave && mapToSave.size > 0) {
            let uriTokenData:any = {
              ledger_index: this.getCurrentLedgerIndex(),
              ledger_hash: this.getCurrentLedgerHash(),
              ledger_close: this.getCurrentLedgerCloseTime(),
              ledger_close_ms: this.getCurrentLedgerCloseTimeMs(),
              uriTokens: []
            };

            console.time("saveUriTokenDataToFS");

            let uriTokenCounter = 0;
            let fileNumber = 1;
  
            mapToSave.forEach((value, key, map) => {
              uriTokenData["uriTokens"].push(value);
              uriTokenCounter++;

              if(uriTokenCounter%1000000 == 0) { //save max 1 million NFTs per file
                fs.writeFileSync(DATA_PATH+"uri_tokens/new_uriTokenData_"+fileNumber+".js", JSON.stringify(uriTokenData));
                uriTokenData["uriTokens"] = [];
                fileNumber++;
              }
            });

            //write left over to file system
            if(uriTokenData["uriTokens"].length > 0) {
              fs.writeFileSync(DATA_PATH+"uri_tokens/new_uriTokenData_"+fileNumber+".js", JSON.stringify(uriTokenData));
              fileNumber++;
            }
  
            for(let i = 1; i < fileNumber; i++) {
              fs.renameSync(DATA_PATH+"uri_tokens/new_uriTokenData_"+i+".js", DATA_PATH+"uri_tokens/uriTokenData_"+i+".js");
            }
            
            console.timeEnd("saveUriTokenDataToFS");
  
          } else {
            console.log("uri token data is empty!");
          }
        }
      } catch(err) {
        console.log(err);
      }
    }

    public async readCurrentLedgerFromFS(): Promise<number> {
      try {
        //console.log("loading nft issuer data from FS");
        if(fs.existsSync(DATA_PATH+"uri_tokens/uriTokenData_1.js")) {
            let uriTokenData:any = JSON.parse(fs.readFileSync(DATA_PATH+"uri_tokens/uriTokenData_1.js").toString());
            if(uriTokenData && uriTokenData.ledger_index) {
                return uriTokenData.ledger_index;
            } else {
              return -1;
            }
        } else {
          console.log("uri token data file does not exist yet.")
          return -1;
        }
      } catch(err) {
        console.log("error reading uri token data from FS");
        console.log(err);
        return -1;
      }  
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
  }