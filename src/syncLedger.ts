import { NFT } from './util/types';
import { Client, LedgerRequest, LedgerResponse, parseNFTokenID, TransactionMetadata } from 'xrpl';
import * as rippleAddressCodec from 'ripple-address-codec';
import { NftIssuerAccounts } from './nftIssuerAccounts';


export class LedgerSync {

    private static _instance: LedgerSync;

    private client = new Client("ws://127.0.0.1:6006");

    private finishedIteration:boolean = false;

    private nftIssuer:NftIssuerAccounts;
    private currentKnownLedger: number = 0;

    private constructor() { }

    public static get Instance(): LedgerSync
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async start(): Promise<void> {

      this.nftIssuer = NftIssuerAccounts.Instance;

      //reinitialize client
      this.client.on('disconnected', ()=> {
        console.log("DISCONNECTED!!! RECONNECTING!")
        this.client.disconnect();
        this.client.removeAllListeners();
        this.start();
      })

      this.client.on('error', () => {
          console.log("ERROR HAPPENED! Re-Init!");
          this.client.disconnect();
          this.client.removeAllListeners();
          this.start();
      })

      this.client.on('connected',() => {
        console.log("Connected.")
      });

      await this.client.connect();

      const serverInfo = await this.client.request({ command: "server_info" });
      console.log({ serverInfo });

      console.log("start listening for ledgers ...")
      await this.client.request({command: 'subscribe', streams: ['ledger']});

      //get current known ledger and try to catch up
      await this.startListeningOnLedgerClose();
      this.iterateThroughMissingLedgers();
    }

    private async iterateThroughMissingLedgers() {

      this.currentKnownLedger = this.nftIssuer.getCurrentLedgerIndex();

      try {
        while(true) {
          let ledgerRequest:LedgerRequest = {
            command: 'ledger',
            ledger_index: this.currentKnownLedger+1,
            transactions: true,
            expand: true              
          }

          let ledgerResponse:LedgerResponse = await this.client.request(ledgerRequest);

          if(ledgerResponse?.result) {

            console.log("analyzing ledger: " + ledgerResponse.result.ledger_index)

            if(!ledgerResponse.result.ledger.closed) { //if we are not closed yet, break and listen for ledger close!
              break;
            }

            if(ledgerResponse.result.ledger?.transactions) {
              let transactions = ledgerResponse.result.ledger.transactions;

              for(let i = 0; i < transactions.length; i++) {
                if(transactions[i] && typeof(transactions[i]) === 'object') {
                  await this.analyzeTransaction(transactions[i]);
                }
              }
            }

            this.currentKnownLedger = ledgerResponse.result.ledger_index;
          }
        }

      } catch(err) {
        console.log("err 1")
        console.log(err);
      }

      this.finishedIteration = true;
      console.log("FINISHED SYNCING BACK!")
    }

    private async startListeningOnLedgerClose() {

      this.client.on('ledgerClosed', async ledgerClose => {

        try {
          //we have a closed ledger. Request the transactions and try to analyze them!
          if(this.finishedIteration) {
            console.log("ledger closed! " + ledgerClose.ledger_index);
            console.log("currentKnownLedger: " + this.currentKnownLedger);

            if((this.currentKnownLedger+1) == ledgerClose.ledger_index) {

              let ledgerRequest:LedgerRequest = {
                command: 'ledger',
                ledger_index: ledgerClose.ledger_index,
                transactions: true,
                accounts: false,
                binary: false,
                owner_funds: false,
                queue: false,
                full: false,
                expand: true
              }

              let ledgerResponse:LedgerResponse = await this.client.request(ledgerRequest);

              if(ledgerResponse?.result?.ledger?.transactions) {
                let transactions = ledgerResponse.result.ledger.transactions;

                console.log("having transactions: " + transactions.length);

                for(let i = 0; i < transactions.length; i++) {
                  if(transactions[i]) {
                    await this.analyzeTransaction(transactions[i]);
                  }
                }
              }

              this.nftIssuer.setCurrentLedgerIndex(ledgerResponse.result.ledger_index);
              this.nftIssuer.setCurrentLedgerHash(ledgerResponse.result.ledger.ledger_hash);
              this.nftIssuer.setCurrentLedgerCloseTime(ledgerResponse.result.ledger.close_time_human);
              this.nftIssuer.setCurrentLedgerCloseTimeMs(ledgerResponse.result.ledger.close_time);

              await this.nftIssuer.saveNFTDataToFS();

              this.currentKnownLedger = ledgerResponse.result.ledger_index;

            } else {
              console.log("something is wrong, reset!");
              //this.client.disconnect();
              //this.client.removeAllListeners();
              //this.init();
            }
          } else {
            console.log("Ledger closed but waiting for catch up! current ledger: " + this.currentKnownLedger + " | last closed ledger: " + ledgerClose.ledger_index);
          }
        } catch(err) {
          console.log("err 2")
          console.log(err);
        }
      });     
    }

    private analyzeTransaction(transaction:any) {
      if(transaction && transaction.metaData?.TransactionResult == "tesSUCCESS" && (transaction.transaction.TransactionType == "NFTokenAcceptOffer" || transaction.transaction.TransactionType == "NFTokenCancelOffer" || transaction.transaction.TransactionType == "NFTokenCreateOffer" || transaction.transaction.TransactionType == "NFTokenBurn" || transaction.transaction.TransactionType == "NFTokenMint")) {

        console.log("analyzing NFT Transaction!")

        if(transaction.transaction.TransactionType == "NFTokenMint") { // NEW NFT
          let mintedTokenId = this.getMintedTokenId(transaction.metaData);

          if(mintedTokenId) {

            console.log("minted token: " + mintedTokenId);

            let parsedNft = parseNFTokenID(mintedTokenId);

            let newNftEntry:NFT = {
              NFTokenID: parsedNft.NFTokenID,
              Issuer: transaction.transaction.Account,
              Owner: transaction.transaction.Account,
              Taxon: parsedNft.Taxon,
              TransferFee: parsedNft.TransferFee,
              Flags: parsedNft.Flags,
              Sequence: parsedNft.Sequence,
              URI: transaction.transaction.URI
            }

            this.nftIssuer.addNFT(newNftEntry);
          }

        } else if(transaction.transaction.TransactionType == "NFTokenBurn") { // BURNED NFT
          let burnedTokenId = this.getBurnedTokenId(transaction.metaData);


          if(burnedTokenId) {
            console.log("burned token: " + burnedTokenId);
            this.nftIssuer.removeNft(burnedTokenId);
          }

        } else { // CHECK FOR OWNER CHANGE!
          let newNftOwner = this.getNewNFTOwnerAddress(transaction.metaData);
          let nftokenId = newNftOwner[0];
          let newOwnerAccount = newNftOwner[1];

          if(nftokenId && newOwnerAccount) {
            console.log("changed nftoken: " + nftokenId);
            console.log("new owner: " + newOwnerAccount);

            let existingNft = this.nftIssuer.getNft(nftokenId);

            if(existingNft) {
              existingNft.Owner = newOwnerAccount;
              this.nftIssuer.addNFT(existingNft);
            } else {
              console.log("THIS SHOULD NEVER HAVE HAPPENED?!?!? NEW NFT NOT POSSIBLE!")
              let parsedNft = parseNFTokenID(nftokenId);

              let newNftEntry:NFT = {
                NFTokenID: parsedNft.NFTokenID,
                Issuer: transaction.transaction.Account,
                Owner: transaction.transaction.Account,
                Taxon: parsedNft.Taxon,
                TransferFee: parsedNft.TransferFee,
                Flags: parsedNft.Flags,
                Sequence: parsedNft.Sequence,
                URI: transaction.transaction.URI
              }

              this.nftIssuer.addNFT(newNftEntry);
            }
          }
        }
      }
    }

    //analyze meta data to determine new NFToken Owner
    private getNewNFTOwnerAddress(metaData: TransactionMetadata): string[] {
      let analyzedTokens:any[] = this.getPreviousAndFinalTokens(metaData);
      let previousTokens = analyzedTokens[0];
      let finalTokens = analyzedTokens[1];

      let nftokenId:string = null;
      let newOwner:string = null;

      for (let nftokenID of Object.keys(finalTokens)) {
        if(!previousTokens.hasOwnProperty(nftokenID)) {
          console.error(`Previous and final NFToken arrays are not adding up, ${Object.keys(previousTokens).length} <> ${Object.keys(finalTokens).length}!`);
        }
        else {
          if(previousTokens[nftokenID].Owner != finalTokens[nftokenID].Owner) {
            nftokenId = nftokenID;
            newOwner = finalTokens[nftokenID].Owner;
          }
        }
      }

      return [nftokenId, newOwner];
    }

    //anylze meta data to check if NFToken was burned
    private getBurnedTokenId(metaData: TransactionMetadata): string {
      let analyzedTokens:any[] = this.getPreviousAndFinalTokens(metaData);
      let previousTokens = analyzedTokens[0];
      let finalTokens = analyzedTokens[1];

      let burnedTokenId:string = null;

      for (let nftokenID of Object.keys(previousTokens)) {
        if(!finalTokens.hasOwnProperty(nftokenID)) {
          burnedTokenId = nftokenID;
        }
      }

      return burnedTokenId;
    }

    //anylze meta data to check if NFToken was minted
    private getMintedTokenId(metaData: TransactionMetadata): string {
      let analyzedTokens:any[] = this.getPreviousAndFinalTokens(metaData);
      let previousTokens = analyzedTokens[0];
      let finalTokens = analyzedTokens[1];

      let mintedTokenId:string = null;

      for (let nftokenID of Object.keys(finalTokens)) {
        if(!previousTokens.hasOwnProperty(nftokenID)) {
          mintedTokenId = nftokenID;
        }
      }

      return mintedTokenId;
    }

    private getPreviousAndFinalTokens(metaData: TransactionMetadata): any[] {
      let previousTokens = {};
			let finalTokens = {};

      // All affected nodes are iterated and NFTokens extracted, as any change could trigger reorganisation of multiple NFTokenPages
      for (let affectedNodeIndex = 0, k_len = metaData.AffectedNodes.length; affectedNodeIndex < k_len; ++affectedNodeIndex) {
        let affectedNode:any = metaData.AffectedNodes[affectedNodeIndex];
        let node = affectedNode.CreatedNode ? affectedNode.CreatedNode : affectedNode.ModifiedNode ? affectedNode.ModifiedNode : affectedNode.DeletedNode;
        if(node.LedgerEntryType == "NFTokenPage") {
          let pageOwner = rippleAddressCodec.encodeAccountID(Buffer.from(node.LedgerIndex, 'hex').slice(0, 20));

          if(node.NewFields) {
            if(node.NewFields.NFTokens) {
              for (let nftokenIndex = 0, l_len = node.NewFields.NFTokens.length; nftokenIndex < l_len; ++nftokenIndex) {
                if(node.NewFields.NFTokens[nftokenIndex].NFToken) {
                  finalTokens[node.NewFields.NFTokens[nftokenIndex].NFToken.NFTokenID] = node.NewFields.NFTokens[nftokenIndex].NFToken;
                  finalTokens[node.NewFields.NFTokens[nftokenIndex].NFToken.NFTokenID].Owner = pageOwner;
                }
              }
            }
          }
          
          if(affectedNode.ModifiedNode && node.FinalFields) {
            if(node.PreviousFields.NFTokens && node.FinalFields.NFTokens) {
              for (let nftokenIndex = 0, l_len = node.FinalFields.NFTokens.length; nftokenIndex < l_len; ++nftokenIndex) {
                if(node.FinalFields.NFTokens[nftokenIndex].NFToken) {
                  finalTokens[node.FinalFields.NFTokens[nftokenIndex].NFToken.NFTokenID] = node.FinalFields.NFTokens[nftokenIndex].NFToken;
                  finalTokens[node.FinalFields.NFTokens[nftokenIndex].NFToken.NFTokenID].Owner = pageOwner;
                }
              }
            }
          }

          if(affectedNode.DeletedNode && node.FinalFields) {
                            if(node.FinalFields.NFTokens) {
                                for (let nftokenIndex = 0, l_len = node.FinalFields.NFTokens.length; nftokenIndex < l_len; ++nftokenIndex) {
                                    if(node.FinalFields.NFTokens[nftokenIndex].NFToken) {
                                        previousTokens[node.FinalFields.NFTokens[nftokenIndex].NFToken.NFTokenID] = node.FinalFields.NFTokens[nftokenIndex].NFToken;
                                        previousTokens[node.FinalFields.NFTokens[nftokenIndex].NFToken.NFTokenID].Owner = pageOwner;
                                    }
                                }
                            }
                        }
          
          if(node.PreviousFields) {
            if(node.PreviousFields.NFTokens) {
              for (let nftokenIndex = 0, l_len = node.PreviousFields.NFTokens.length; nftokenIndex < l_len; ++nftokenIndex) {
                if(node.PreviousFields.NFTokens[nftokenIndex].NFToken) {
                  previousTokens[node.PreviousFields.NFTokens[nftokenIndex].NFToken.NFTokenID] = node.PreviousFields.NFTokens[nftokenIndex].NFToken;
                  previousTokens[node.PreviousFields.NFTokens[nftokenIndex].NFToken.NFTokenID].Owner = pageOwner;
                }
              }
            }
          }
        }
      }

      return [previousTokens, finalTokens];
    }
}