import * as fs from 'fs';
import consoleStamp = require("console-stamp");
import { encodeAccountID } from 'ripple-address-codec';
import { parseNFTokenID } from 'xrpl';
import { NFT } from './util/types';

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class NftIssuerAccounts {

    private static _instance: NftIssuerAccounts;

    private nftOffersArray:any[] = [];

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
        try {
          let offer = nftOffers[j];

          if(typeof(offer.Amount) === 'string' && (!offer.Destination || offer.Destination === "")) {
            this.nftOffersArray.push(offer);
          }
        } catch(err) {
          //nothing
        }
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
      this.nftOffersArray = [];
      
  }

  public async saveNFTDataToFS(): Promise<void> {
    let mapToSave:Map<string, NFT> = this.nftokensMap;
    if(mapToSave && mapToSave.size > 0) {
        let nftData:any = {
          "nfts": []
        };

        mapToSave.forEach((value, key, map) => {
          nftData["nfts"].push(value);
        });

        fs.writeFileSync("./../nftData_new.js", JSON.stringify(nftData));
        fs.renameSync("./../nftData_new.js", "./../nftData.js");

        console.log("saved " + mapToSave.size + " nft data to file system");
    } else {
      console.log("nft data is empty!");
    }

    try {

      let marginNft:any = {}

      for(let i = 0; i < this.nftOffersArray.length; i++) {
        let offer = this.nftOffersArray[i];
        let offerAmount = parseInt(offer.Amount);

        if(!offer.Destination || offer.Destination === "") {

          if(!marginNft[offer.NFTokenID]) {
            marginNft[offer.NFTokenID] = {
              buy: null,
              sell: null
            }
          }
    
          if(!offer.Flags || offer.Flags == 0) {
            //buy offer, compare to current buy offer!
            if(!marginNft[offer.NFTokenID].buy) {
              marginNft[offer.NFTokenID].buy = offer;
            } else if(offerAmount > parseInt(marginNft[offer.NFTokenID].buy.Amount)) {
              //replace offer if better!
              marginNft[offer.NFTokenID].buy = offer;
            }
              
          } else if(offer.Flags && offer.Flags == 1) {
            //sell offer
            //first check if seller == owner
            if(this.nftokensMap.get(offer.NFTokenID).Owner === offer.Owner) {
              //owner == seller, go ahead!
              if(!marginNft[offer.NFTokenID].sell) {
                marginNft[offer.NFTokenID].sell = offer;
              } else if(offerAmount < parseInt(marginNft[offer.NFTokenID].sell.Amount)) {
                //replace offer if better!
                marginNft[offer.NFTokenID].sell = offer;
              }
            }
          }
        }
      }


      let marginOption:any[] = [];

      for(let nft in marginNft) {
        if(marginNft.hasOwnProperty(nft)) {
          let nftOffers = marginNft[nft];

          if(nftOffers && nftOffers.buy && nftOffers.sell) {
            let buyAmount = parseInt(nftOffers.buy.Amount);
            let sellAmount = parseInt(nftOffers.sell.Amount);
            
            if(buyAmount > sellAmount)
              marginOption.push({offers: nftOffers})
          }
        }
      }

      if(marginOption) {
  
        fs.writeFileSync("./../marginOptions.js", JSON.stringify(marginOption));
  
        console.log("saved nft margin option data to file system");
      }
    } catch(err) {
      console.log(err);
    }
  }
}