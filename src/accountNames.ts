import * as config from './util/config'
import * as fetch from 'node-fetch';
import * as scheduler from 'node-schedule';
import * as HttpsProxyAgent from 'https-proxy-agent';
import consoleStamp = require("console-stamp");
import * as fs from 'fs';

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class AccountNames {
    private proxy = new HttpsProxyAgent(config.PROXY_URL);
    private useProxy = config.USE_PROXY;

    private bithompServiceNames:Map<string, string> = new Map();
    private xrpscanUserNames:Map<string, string> = new Map();
    private bithompUserNames:Map<string, string> = new Map();

    constructor() {
        scheduler.scheduleJob("reloadUserNames", {dayOfWeek: 1}, this.resolveAllUserNames);
        this.loadBithompUserNamesFromFS();
    }

    public async resolveAllUserNames(): Promise<void> {
        //load bithomp services
        await this.loadBithompServiceNames();
        //load xrpscan services
        await this.loadXRPScanNames();
        //reset all unkown accounts
        let iteratorMap: Map<string,string> = new Map(this.bithompUserNames);
        iteratorMap.forEach((value, key, map) => {
            if(value == null)
                this.bithompUserNames.delete(key);
        });
        

    }

    private async loadBithompServiceNames() :Promise<void> {
        try {
            console.log("loadservice names from bithomp");
            let bithompResponse:any = await fetch.default("https://bithomp.com/api/v2/services/addresses", {headers: { "x-bithomp-token": config.BITHOMP_TOKEN }, agent: this.useProxy ? this.proxy : null})
            
            if(bithompResponse && bithompResponse.ok) {
                let knownServices:any = await bithompResponse.json();
                if(knownServices && knownServices.addresses) {
                    let addresses:any = knownServices.addresses;

                    for (var address in addresses) {
                        if (addresses.hasOwnProperty(address)) {
                            let name:string = addresses[address].name;
                            if(name) {
                                this.bithompServiceNames.set(address, name);
                            }
                        }
                    }
                }
            }

            console.log("bithomp service names: " + this.bithompServiceNames.size);
        } catch(err) {
            console.log("err retrieving addresse from bithomp");
            console.log(err);
        }
    }

    private async loadXRPScanNames() :Promise<void> {
        try {
            console.log("load xrpscan names");
            let xrpscanResponse:any = await fetch.default("https://api.xrpscan.com/api/v1/names/well-known", { agent: this.useProxy ? this.proxy : null})
            
            if(xrpscanResponse && xrpscanResponse.ok) {
                let knownServices:any[] = await xrpscanResponse.json();
                if(knownServices) {
                    for(let i = 0; i < knownServices.length; i++) {
                        let address:string = knownServices[i].account;
                        let name:string = knownServices[i].name;

                        if(address && name && address.length > 0 && name.length > 0) {
                            this.xrpscanUserNames.set(address, name);
                        }
                    }
                }
            }

            console.log("xrpscan names: " + this.xrpscanUserNames.size);
        } catch(err) {
            console.log("err retrieving addresse from xrpscan");
            console.log(err);
        }
    }

    private async loadBithompSingleAccountName(xrplAccount: string): Promise<void> {
        try {
            if(!this.bithompServiceNames.has(xrplAccount) && !this.xrpscanUserNames.has(xrplAccount) && !this.bithompUserNames.has(xrplAccount)) {
                console.log("resolving: " + xrplAccount);
                let bithompResponse:any = await fetch.default("https://bithomp.com/api/v2/address/"+xrplAccount+"?username=true", {headers: { "x-bithomp-token": config.BITHOMP_TOKEN }, agent: this.useProxy ? this.proxy : null})
                
                if(bithompResponse && bithompResponse.ok) {
                    let accountInfo:any = await bithompResponse.json();
            
                    console.log("resolved: " + JSON.stringify(accountInfo));
                    if(accountInfo)
                        this.bithompUserNames.set(xrplAccount, accountInfo.username ? accountInfo.username : null);

                    console.log("bithompUserNames size: " + this.bithompUserNames.size);
                }
            }
        } catch(err) {
            console.log("err retrieving single addresse from bithomp");
            console.log(err);
        }   
    }

    getUserName(xrplAccount:string): string {
        if(this.bithompServiceNames.has(xrplAccount) && this.bithompServiceNames.get(xrplAccount) != null)
            return this.bithompServiceNames.get(xrplAccount) + " (Bithomp Service)";

        else if(this.xrpscanUserNames.has(xrplAccount) && this.xrpscanUserNames.get(xrplAccount) != null)
            return this.xrpscanUserNames.get(xrplAccount) + " (XRPScan Service)";
        
        else if(this.bithompUserNames.has(xrplAccount) && this.bithompUserNames.get(xrplAccount) != null)
            return this.bithompUserNames.get(xrplAccount) + " (Bithomp User)";

        else
            //try to resolve user name - seems like it is a new one!
            return null
    }

    async initAccountNames(xrplAccount:string): Promise<void> {
        if(this.bithompServiceNames.has(xrplAccount))
            return;

        else if(this.xrpscanUserNames.has(xrplAccount))
            return;
        
        else if(this.bithompUserNames.has(xrplAccount))
            return;

        else
            //try to resolve user name - seems like it is a new one!
            this.loadBithompSingleAccountName(xrplAccount);
    }

    public async saveBithompUserNamesToFS(): Promise<void> {
        if(this.bithompUserNames && this.bithompUserNames.size > 0) {
            let bithompNames:any = {};
            this.bithompUserNames.forEach((value, key, map) => {
                bithompNames[key] = value;
            });
            fs.writeFileSync("./../bithompUserNames.js", JSON.stringify(bithompNames));

            console.log("saved " + this.bithompUserNames.size + " user names to file system");
        }
    }

    private async loadBithompUserNamesFromFS(): Promise<void> {
        console.log("loading bithomp user names");
        if(fs.existsSync("./../bithompUserNames.js")) {
            let bithompNames:any = fs.readFileSync("./../bithompUserNames.js").toJSON().data;
            //console.log(JSON.stringify(bithompNames));
            if(bithompNames) {
                for (var account in bithompNames) {
                    if (bithompNames.hasOwnProperty(account)) {
                        this.bithompUserNames.set(account, bithompNames[account]);
                    }
                }

                console.log("loaded " + this.bithompUserNames.size + " user names from file system");
            }
        } else {
            console.log("bithomp user name file does not exist yet.")
        }
    }
}