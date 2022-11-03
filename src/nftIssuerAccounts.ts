import * as fs from 'fs';
import consoleStamp = require("console-stamp");
import { AccountNames } from './accountNames';
import { IssuerData, NFT } from "./util/types"
import { LedgerScanner } from './ledgerScanner';
import { TokenCreation } from './tokenCreation';
import { encodeAccountID } from 'ripple-address-codec';
import { parseNFTokenID } from 'xrpl';

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class NftIssuerAccounts {

    private static _instance: NftIssuerAccounts;
    
    private accountInfo:AccountNames;
    private tokenCreation:TokenCreation;

    private ledgerScanner:LedgerScanner;

    private nftokensMap: Map<string, NFT> = new Map();

    private constructor() { }

    public static get Instance(): NftIssuerAccounts
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async init(): Promise<void> {
        this.accountInfo = AccountNames.Instance;
        this.ledgerScanner = LedgerScanner.Instance;

        await this.accountInfo.init();
        await this.tokenCreation.init();
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
                URI: uri,
                buy_offers: 0,
                sell_offers: 0
              }

              await this.addNewToken(newNftEntry.NFTokenID, newNftEntry);
            } else {
              console.log("NO TOKEN ID?????????????????????");
              console.log(JSON.stringify(singleNFTFromPage));
            }
          }
        }
      }

      let nftOffers:any[] = ledgerState.filter(element => element.LedgerEntryType === 'NFTokenOffer');

      for(let j = 0; j < nftOffers.length; j++) {
        let nfTokenId = nftOffers[j].NFTokenID;

        await this.increaseOfferCount(nfTokenId, nftOffers[j].Flags && nftOffers[j].Flags === 1);
      }
    }
    
    private async addNewToken(nftokenId:string, newNft:NFT): Promise<void> {
      if(this.hasToken(nftokenId)) {
        let nft = this.getToken(nftokenId);

        newNft.buy_offers = nft.buy_offers;
        newNft.sell_offers = nft.sell_offers;
      }

      this.nftokensMap.set(nftokenId, newNft);
    }
    
    private hasToken(nftokenId: string) : boolean {
        return this.nftokensMap.has(nftokenId);
    }
    
    private getToken(nftokenId: string) : NFT {
      return this.nftokensMap.get(nftokenId);
    }

    private increaseOfferCount(nftokenId: string, sell: boolean) {
      if(this.hasToken(nftokenId)) {
        let nft = this.getToken(nftokenId);
        
        if(sell)
          nft.sell_offers = nft.sell_offers + 1;
        else
          nft.buy_offers = nft.buy_offers + 1;

        this.nftokensMap.set(nftokenId, nft);
      } else {
        let nft:NFT = {
          Issuer: "",
          NFTokenID: nftokenId,
          Owner: "",
          Sequence: 0,
          Taxon: 0,
          TransferFee: 0,
          URI: "",
          buy_offers: sell ? 0 : 1,
          sell_offers: sell ? 1 : 0
        }

        this.nftokensMap.set(nftokenId, nft);
      }
    }
  

  public getNFTMap():Map<string, NFT> {
    return this.nftokensMap;
  }

  public clearIssuer() {
      this.nftokensMap.clear();
  }

  public async saveNFTDataToFS(): Promise<void> {
    let mapToSave:Map<string, NFT[]> = this.transformNFTData(this.nftokensMap);
    if(mapToSave && mapToSave.size > 0) {
        let nftData:any = {
          "ledger_index": this.ledgerScanner.getLedgerIndex(),
          "ledger_date": this.ledgerScanner.getLedgerCloseTime(),
          "ledger_time_ms": this.ledgerScanner.getLedgerCloseTimeMs(),
          "ledger_hash": this.ledgerScanner.getLedgerHash(),
          "nfts": {

          }
        };

        mapToSave.forEach((value, key, map) => {
          nftData["nfts"][key] = value;
        });

        fs.writeFileSync("./../nftData_new.js", JSON.stringify(nftData));
        fs.renameSync("./../nftData_new.js", "./../nftData.js");

        console.log("saved " + mapToSave.size + " nft data to file system");
    } else {
      console.log("nft data is empty!");
    }
  }

  private transformNFTData(nftMap: Map<string, NFT>): Map<string, NFT[]> {
    let mapToTransform:Map<string, NFT> = new Map(nftMap);
    let finalMap: Map<string, NFT[]> = new Map();

    mapToTransform.forEach((value, key, map) => {
      if(finalMap.has(value.Issuer)) {
        finalMap.get(value.Issuer).push(value);
      } else {
        finalMap.set(value.Issuer, [value]);
      }
    });

    return finalMap;
  }
}