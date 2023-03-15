import * as fs from 'fs';
import consoleStamp = require("console-stamp");
import { encodeAccountID } from 'ripple-address-codec';
import { parseNFTokenID } from 'xrpl';
import { NFT, NFTokenOffer } from './util/types';
import { DATA_PATH } from './util/config';

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class NftIssuerAccounts {

    private static _instance: NftIssuerAccounts;

    private nftokensMap: Map<string, NFT> = new Map();
    private nftOfferMap: Map<string, NFTokenOffer> = new Map();

    private current_ledger_index: number;
    private current_ledger_date: string;
    private current_ledger_time_ms: number;
    private current_ledger_hash: string;

    private constructor() { }

    public static get Instance(): NftIssuerAccounts
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async resolveNFToken(ledgerState:any): Promise<void> {   

      let nftokenPages:any[] = ledgerState.filter(element => element.LedgerEntryType === 'NFTokenPage');

      let nftokenOffers:NFTokenOffer[] = ledgerState.filter(element => element.LedgerEntryType === 'NFTokenOffer');

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

              await this.addNFT(newNftEntry);
            } else {
              console.log("NO TOKEN ID?????????????????????");
              console.log(JSON.stringify(singleNFTFromPage));
            }
          }
        }
      }

      for(let j = 0; j < nftokenOffers.length; j++) {
        let singleOffer:any = nftokenOffers[j];

        if(singleOffer) {
          //add if not yet added
          this.nftOfferMap.set(singleOffer.index, {
            Amount: singleOffer.Amount ? singleOffer.Amount : "0",
            Flags: singleOffer.Flags ? singleOffer.Flags : 0,
            NFTokenID: singleOffer.NFTokenID,
            OfferID: singleOffer.index,
            Owner: singleOffer.Owner,
            Destination: singleOffer.Destination ? singleOffer.Destination : null,
            Expiration: singleOffer.Expiration ? singleOffer.Expiration : null
          });
        }
      }
    }
    
    public async addNFT(newNft:NFT): Promise<void> {
      this.nftokensMap.set(newNft.NFTokenID, newNft);
    }

    public removeNft(burnedNftokenId:string) {
      this.nftokensMap.delete(burnedNftokenId);
    }

    public getNft(nftokenId:string) {
      return this.nftokensMap.get(nftokenId);
    }

    public getNFTMap():Map<string, NFT> {
      return this.nftokensMap;
    }

    public clearData() {
        this.nftokensMap.clear();
        this.nftOfferMap.clear();
    }

    public async saveNFTDataToFS(): Promise<void> {
      let currentWrittenLedger = await this.readCurrentLedgerFromFS();

      if(this.getCurrentLedgerIndex() > currentWrittenLedger) {
        let mapToSave:Map<string, NFT> = new Map(this.nftokensMap);
        if(mapToSave && mapToSave.size > 0) {
          let nftData:any = {
            ledger_index: this.getCurrentLedgerIndex(),
            ledger_hash: this.getCurrentLedgerHash(),
            ledger_close: this.getCurrentLedgerCloseTime(),
            ledger_close_ms: this.getCurrentLedgerCloseTimeMs(),
            "nfts": []
          };

          mapToSave.forEach((value, key, map) => {
            nftData["nfts"].push(value);
          });         

          console.time("saveNFTDataToFS");

          fs.writeFileSync(DATA_PATH+"nftData_new.js", JSON.stringify(nftData));
          fs.renameSync(DATA_PATH+"nftData_new.js", DATA_PATH+"nftData.js");
          
          console.timeEnd("saveNFTDataToFS");

        } else {
          console.log("nft data is empty!");
        }

        let offerMapToSave:Map<string, NFTokenOffer> = new Map(this.nftOfferMap);
        if(offerMapToSave && offerMapToSave.size > 0) {
          let nftOfferData:any = {
            ledger_index: this.getCurrentLedgerIndex(),
            ledger_hash: this.getCurrentLedgerHash(),
            ledger_close: this.getCurrentLedgerCloseTime(),
            ledger_close_ms: this.getCurrentLedgerCloseTimeMs(),
            "offers": []
          };

          offerMapToSave.forEach((value, key, map) => {
            nftOfferData["offers"].push(value)
          });         

          console.time("saveNFTOffersToFS");

          fs.writeFileSync(DATA_PATH+"nftOffers_new.js", JSON.stringify(nftOfferData));
          fs.renameSync(DATA_PATH+"nftOffers_new.js", DATA_PATH+"nftOffers.js");
          
          console.timeEnd("saveNFTOffersToFS");

        } else {
          console.log("nft data is empty!");
        }
      }
    }

    public async readCurrentLedgerFromFS(): Promise<number> {
      try {
        //console.log("loading nft issuer data from FS");
        if(fs.existsSync(DATA_PATH+"nftData.js")) {
            let nftData:any = JSON.parse(fs.readFileSync(DATA_PATH+"nftData.js").toString());
            if(nftData && nftData.ledger_index) {
                return nftData.ledger_index;
            } else {
              return -1;
            }
        } else {
          console.log("nft issuer data file does not exist yet.")
          return -1;
        }
      } catch(err) {
        console.log("error reading nft issuer data from FS");
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