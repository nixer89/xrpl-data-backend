import * as fetch from 'node-fetch';
import consoleStamp = require("console-stamp");
import * as fs from 'fs';
import { createInterface } from 'readline';
import { once } from 'events';

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
        fs.appendFileSync("./../issuerCreation.txt", issuerKey+"="+JSON.stringify(creation)+"\n");

        console.log("saved " + issuerKey+"="+JSON.stringify(creation) + " to isser creation file on file system");
    }

    private async loadIssuerCreationFromFS(): Promise<void> {
        console.log("loading isser creation from FS");
        try {
            if(fs.existsSync("./../issuerCreation.txt")) {
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
                
                    console.log('File processed.');
                    console.log("loaded token creation from file system");

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

    async getTokenCreationDate(issuer: string, currency: string): Promise<any> {
        let issuerKey = issuer+"_"+currency;

        if(this.tokenCreation.has(issuerKey) && this.tokenCreation.get(issuerKey) != null) {
            //take it from cache
            return this.tokenCreation.get(issuerKey);
        } else {
            try {
                //try to resolve it from xrplorer.com API
                console.log("resolving: " + issuerKey);
                let xrplorerResponse:fetch.Response = await fetch.default("https://api.xrplorer.com/custom/getTokenBirth?issuer="+issuer+"&currency="+currency)
                
                if(xrplorerResponse && xrplorerResponse.ok) {
                    let issuerCreation:any = await xrplorerResponse.json();

                    issuerCreation = JSON.stringify(issuerCreation);
            
                    console.log("resolved: " + JSON.stringify(issuerCreation));
                    
                    this.tokenCreation.set(issuerKey, issuerCreation);
                    this.appendIssuerCreationToFS(issuerKey, issuerCreation);

                    return issuerCreation;
                } else {
                    
                    let issuerCreation:any = await xrplorerResponse.json();

                    if(issuerCreation && issuerCreation.error && "No results." == issuerCreation.error) {
                        issuerCreation = {date: "Unkown"}

                        this.tokenCreation.set(issuerKey, issuerCreation);
                        this.appendIssuerCreationToFS(issuerKey, issuerCreation);

                        return issuerCreation;
                    } else {
                        return null;
                    }       
                }
            } catch(err) {
                console.log(JSON.stringify(err));
                return null;
            }
        }
    }
}