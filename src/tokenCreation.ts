import * as fetch from 'node-fetch';
import consoleStamp = require("console-stamp");
import * as fs from 'fs';
import { createInterface } from 'readline';
import { once } from 'events';
import { DATA_PATH } from './util/config';

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class TokenCreation {

    private static _instance: TokenCreation;

    private tokenCreation:Map<string, any> = new Map();

    private constructor() { }

    public static get Instance(): TokenCreation
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async init(): Promise<void> {
        await this.loadIssuerCreationFromFS();
    }

    private async appendIssuerCreationToFS(issuerKey:string, creation: any): Promise<void> {
        this.tokenCreation.set(issuerKey, creation);
        fs.appendFileSync(DATA_PATH+"issuerCreation.txt", issuerKey+"="+JSON.stringify(creation)+"\n");

        //console.log("saved " + issuerKey+"="+JSON.stringify(creation) + " to issuer creation file on file system");
    }

    private async loadIssuerCreationFromFS(): Promise<void> {
        console.log("loading issuer creation from FS");
        try {
            if(fs.existsSync(DATA_PATH+"issuerCreation.txt")) {
                try {
                    const rl = createInterface({
                      input: fs.createReadStream('./../issuerCreation.txt'),
                      crlfDelay: Infinity
                    });
                
                    rl.on('line', (line) => {

                      let split:string[] = line.split('=');

                      this.tokenCreation.set(split[0], JSON.parse(split[1]));
                    });
                
                    await once(rl, 'close');
                
                    //console.log('File processed.');
                    //console.log("loaded token creation from file system");

                } catch (err) {
                    console.error(err);
                    console.log("error reading token creation from FS");
                }
            } else {
                console.log("token creation file does not exist yet.")
            }
        } catch(err) {
            console.log("error reading token creation from FS");
            console.log(err);
            this.tokenCreation.clear();
        }
    }

    async resolveTokenCreationDateFromXrplorer(issuerKey:string): Promise<void> {
        let splitValues:string[] = issuerKey.split("_");
        let issuer = splitValues[0];
        let currency = splitValues[1];

        
        try {
            let issuerCreation = {date: "Unknown"};

            //try to resolve it from xrplorer.com API
            //console.log("resolving: " + issuerKey);
            
            let xrplorerResponse:fetch.Response = await fetch.default("https://api.xrplorer.com/custom/getTokenBirth?issuer="+issuer+"&currency="+currency)
            
            if(xrplorerResponse && xrplorerResponse.ok) {
                issuerCreation = await xrplorerResponse.json();
        
                //console.log("resolved: " + JSON.stringify(issuerCreation));   
            }

            await this.appendIssuerCreationToFS(issuerKey, issuerCreation);

        } catch(err) {
            console.log("ERR RESOLVING TOKEN CREATION");
            console.log(err);
        }
    }

    isTokenInCache(issuerTokenKey:string) {
        return this.tokenCreation && this.tokenCreation.has(issuerTokenKey) && this.tokenCreation.get(issuerTokenKey) != null;
    }

    setDummyValueInCache(issuerTokenKey:string) {
        this.tokenCreation.set(issuerTokenKey, {date: "Resolving..."});
    }
}