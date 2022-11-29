import * as fs from 'fs';
import consoleStamp = require("console-stamp");
import { encodeAccountID } from 'ripple-address-codec';
import { parseNFTokenID } from 'xrpl';
import { NFT } from './util/types';

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class NftIssuerAccounts {

    private static _instance: NftIssuerAccounts;

    private nftokensMap: Map<string, NFT> = new Map();

    private constructor() { }

    public static get Instance(): NftIssuerAccounts
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async resolveNFToken(ledgerState:any): Promise<void> {   

      let nftokenPages:any[] = ledgerState.filter(element => element.LedgerEntryType === 'NFTokenPage');

      for(let i = 0; i < nftokenPages.length; i++) {
        let nftOwner:string = encodeAccountID(Buffer.from(nftokenPages[i].index, 'hex').slice(0, 20));

        let nftokens:any[] = nftokenPages[i].NFTokens

        if(nftokens && nftokens.length > 0) {
          for(let j = 0; j < nftokens.length; j++) {
            let singleNFTFromPage = nftokens[j]["NFToken"];

            if(singleNFTFromPage["NFTokenID"]) {
              let parsedNft = parseNFTokenID(singleNFTFromPage["NFTokenID"]);
              let uri = singleNFTFromPage["URI"];

              let nftIssuer = parsedNft.Issuer;

              let newNftEntry:NFT = {
                NFTokenID: parsedNft.NFTokenID,
                Issuer: nftIssuer,
                Owner: nftOwner,
                Taxon: parsedNft.Taxon,
                TransferFee: parsedNft.TransferFee,
                Flags: parsedNft.Flags,
                Sequence: parsedNft.Sequence,
                URI: uri
              }

              await this.addNewToken(newNftEntry.NFTokenID, newNftEntry);
            } else {
              console.log("NO TOKEN ID?????????????????????");
              console.log(JSON.stringify(singleNFTFromPage));
            }
          }
        }
      }
    }
    
    private async addNewToken(nftokenId:string, newNft:NFT): Promise<void> {
      this.nftokensMap.set(nftokenId, newNft);
    }  

    public getNFTMap():Map<string, NFT> {
      return this.nftokensMap;
    }

    public clearIssuer() {
        this.nftokensMap.clear();
    }

    public async saveNFTDataToFS(index:number, hash: string, closeTime: string, closeTimeMs: number): Promise<void> {
      let mapToSave:Map<string, NFT> = this.nftokensMap;
      if(mapToSave && mapToSave.size > 0) {
        let nftData:any = {
          ledger_index: index,
          ledger_hash: hash,
          ledger_close: closeTime,
          ledger_close_ms: closeTimeMs,
          "nfts": []
        };

          mapToSave.forEach((value, key, map) => {
            nftData["nfts"].push(value);
          });

          if(!fs.existsSync("./../nftData.js")) {
            fs.writeFileSync("./../nftData.js", JSON.stringify(nftData));
            console.log("saved " + mapToSave.size + " nft data to file system");
          } else {
            console.log("not writing nft data. exists already")
          }

      } else {
        console.log("nft data is empty!");
      }
    }
  }