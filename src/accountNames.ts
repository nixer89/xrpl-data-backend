import * as config from './util/config'
import * as fetch from 'node-fetch';
import * as scheduler from 'node-schedule';
import consoleStamp = require("console-stamp");
import * as fs from 'fs';
import { IssuerVerification } from './util/types';

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class AccountNames {

    private static _instance: AccountNames;

    private bithompServiceNames:Map<string, IssuerVerification> = new Map();
    private xrpscanUserNames:Map<string, IssuerVerification> = new Map();
    private bithompUserNames:Map<string, IssuerVerification> = new Map();
    private kycMap:Map<string, boolean> = new Map();
    private kycDistributorMap:Map<string, string> = new Map();

    private constructor() {
        //init kyc distributor account
        
        //ChorusX
        this.kycDistributorMap.set("rKk7mu1dNB25fsPEJ4quoQd5B8QmaxewKi", "rhmaAYX86K1drGCxaenoYH2GSBTReja7XH");

        //PALEOCOIN
        this.kycDistributorMap.set("rPfuLd1XmVyxkggAiT9fpLQU81GLb6UDZg", "rMuhg6cHRnNr4g4LnHrXvTrra6D47EG5wp");

        //FSE
        this.kycDistributorMap.set("rs1MKY54miDtMFEGyNuPd3BLsXauFZUSrj", "rNP3mFp8QGe1yXYMdypU7B5rXM1HK9VbDK");

        //SSE
        this.kycDistributorMap.set("rMDQTunsjE32sAkBDbwixpWr8TJdN5YLxu", "rNP3mFp8QGe1yXYMdypU7B5rXM1HK9VbDK");

        //XUM coin
        this.kycDistributorMap.set("r465PJyGWUE8su1oVoatht6cXZJTg1jc2m", "rGiMPyitoCRm4JpRyaTCzysHrifRQUVFs3");

        //Calorie Token
        this.kycDistributorMap.set("rNqGa93B8ewQP9mUwpwqA19SApbf62U7PY", "rUWHYEdNVA7aMCqP5a4WLqtqPAAYd58K83");

        //Hadalite
        this.kycDistributorMap.set("rHiPGSMBbzDGpoTPmk2dXaTk12ZV1pLVCZ", "rwKgwydb7NRHNS8gVpG6QEP2tYqPhroYrK");
        
        //Hada
        this.kycDistributorMap.set("rsR5JSisuXsbipP6sGdKdz5agjxn8BhHUC", "rwKgwydb7NRHNS8gVpG6QEP2tYqPhroYrK");

        //SEC
        this.kycDistributorMap.set("rDN4Ux1WFJJsPCdqdfZgrDZ2icxdAmg2w", "rh3uXD4W3xb2EHCVkMHtNsRYuWgCexS5m8");

        //CCN
        this.kycDistributorMap.set("rG1bDjT25WyvPz757YC9NqdRKyz9ywF8e8", "rEzza37GjHsctYj8XgzRZaXfxt9tC53xST");

        //XPUNK
        this.kycDistributorMap.set("rHEL3bM4RFsvF8kbQj3cya8YiDvjoEmxLq", "rnakpaiPo3ELjETRZxGmyRjcfTgvkRbF4q");

        //SCS
        this.kycDistributorMap.set("rHYr9XNQJf1Kury1wGkht7Hrb9d43PqSMw", "r9h9mkbZWxbWStY2JSaTgyZXJ93ctSUzyB");

        //ZEN
        this.kycDistributorMap.set("rD2C8cVUEdu1o6hiaouxzMpZELRYnVZnh4", "rPgJHaF44SXda465SJV8qphsgZNZ8QVHvn");

        //Equilibrium
        this.kycDistributorMap.set("rpakCr61Q92abPXJnVboKENmpKssWyHpwu", "r4j8qfTo2pBV7YLJMn5Uyga13vYBvikEc6");

        //LOVE
        this.kycDistributorMap.set("rDpdyF9LtYpwRdHZs8sghaPscE8rH9sgfs", "raebqdbssZx9bJaLFo3FtBRYu6UGqSQQv9");

        //AFA
        this.kycDistributorMap.set("ratAFAXeeKaVuAxuWB9W1LuXD5m7Aqf2BH", "ratAFANfrYBBcJetey1ogtafrUfwjWsxi6");

        //DUCK
        this.kycDistributorMap.set("rT5pAVAokKezWrjqnMBF3G8ah4fxVWVVx", "rNyPe9WWBcYGAMwdm4PP1Dj4M1wcjX4EAP");

        //Daric Token
        this.kycDistributorMap.set("rK9AtihZZYWAwZQnJCYzZnyW833vbcPXPf", "r4saqLswxQJRqUw6829X35Qv62dQAJqS1h");

        //XRdoge
        this.kycDistributorMap.set("rLqUC2eCPohYvJCEBJ77eCCqVL2uEiczjA", "rJyeLbeNKrMB2ZVcvqLQLQtB2tsGSw3u1F");
    }

    public static get Instance(): AccountNames
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async init(): Promise<void> {
        scheduler.scheduleJob("reloadUserNames1", {dayOfWeek: 1, hour: 19, minute: 59, second: 0}, () => this.resolveAllUserNames(true));
        scheduler.scheduleJob("reloadUserNames2", {dayOfWeek: 4, hour: 19, minute: 59, second: 0}, () => this.resolveAllUserNames(true));
        scheduler.scheduleJob("reloadKYC", {dayOfWeek: 1,hour: 0, minute: 59, second: 0}, () => this.resetKyc());
        scheduler.scheduleJob("reloadKYC", {dayOfWeek: 4, hour: 0, minute: 59, second: 0}, () => this.resetKyc());
        await this.loadBithompUserNamesFromFS();
        await this.resolveAllUserNames();
        await this.loadKycDataFromFS();
    }

    public async resetKyc() {
        try {
            //reset all no KYC accounts
            let iteratorMap2: Map<string, boolean> = new Map(this.kycMap);
            iteratorMap2.forEach((value, key, map) => {
                if(!value)
                    this.kycMap.delete(key);
            });
        } catch(err) {
            console.log(err);
            console.log("some weird error happened while resetting KYC!");
        }
    }

    public async resolveAllUserNames(deleteEmptyNames?: boolean): Promise<void> {
        try {
            //load bithomp services
            await this.loadBithompServiceNames();
            //load xrpscan services
            await this.loadXRPScanNames();

            if(deleteEmptyNames) {
                //reset all unkown accounts
                let iteratorMap: Map<string,IssuerVerification> = new Map(this.bithompUserNames);
                iteratorMap.forEach((value, key, map) => {
                    if(value == null || value.username == null || value.username.trim().length == 0)
                        this.bithompUserNames.delete(key);
                });
            }
        } catch(err) {
            console.log(err);
            console.log("some weird error happened!");
        }
    }

    public async loadBithompServiceNames() :Promise<void> {
        try {
            console.log("load service names from bithomp");
            let bithompResponse:any = await fetch.default("https://bithomp.com/api/v2/services/addresses", {headers: { "x-bithomp-token": config.BITHOMP_TOKEN }})
            
            if(bithompResponse && bithompResponse.ok) {
                let knownServices:any = await bithompResponse.json();
                if(knownServices && knownServices.addresses) {
                    let addresses:any = knownServices.addresses;
                    let mainName:string = knownServices.name;
                    let domain:string = knownServices.domain;
                    let twitter:string = knownServices.socialAccounts && knownServices.socialAccounts.twitter;

                    for (var address in addresses) {
                        if (addresses.hasOwnProperty(address)) {
                            let name:string = addresses[address].name;
                            name = name ? name : mainName;
                            if(name) {
                                this.bithompServiceNames.set(address, {resolvedBy: "Bithomp", account: address, username: name, domain: domain, twitter: twitter, verified: true});
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
            let xrpscanResponse:any = await fetch.default("https://api.xrpscan.com/api/v1/names/well-known")
            
            if(xrpscanResponse && xrpscanResponse.ok) {
                let knownServices:any[] = await xrpscanResponse.json();
                if(knownServices) {
                    for(let i = 0; i < knownServices.length; i++) {
                        let address:string = knownServices[i].account;
                        let name:string = knownServices[i].name;
                        let domain:string = knownServices[i].domain;
                        let twitter:string = knownServices[i].twitter;
                        let verified:boolean = knownServices[i].verified;

                        if(address && name && address.length > 0 && name.length > 0) {
                            this.xrpscanUserNames.set(address, {resolvedBy: "XRPScan", account: address, username: name, domain: domain, twitter: twitter, verified: verified});
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
                //console.log("resolving: " + xrplAccount);
                let bithompResponse:any = await fetch.default("https://bithomp.com/api/v2/address/"+xrplAccount+"?username=true&verifiedDomain=true", {headers: { "x-bithomp-token": config.BITHOMP_TOKEN }})
                
                if(bithompResponse && bithompResponse.ok) {
                    let accountInfo:any = await bithompResponse.json();
            
                    console.log("resolved: " + JSON.stringify(accountInfo));
                    if(accountInfo) {
                        let username:string = accountInfo.username ? accountInfo.username : "";
                        let verifiedDomain:string = accountInfo.verifiedDomain;

                        this.bithompUserNames.set(xrplAccount, {resolvedBy: "Bithomp", account: xrplAccount, domain: verifiedDomain, verified: (verifiedDomain && verifiedDomain.trim().length > 0 ? true : false), username: username, twitter: null});
                    } else {
                        this.bithompUserNames.set(xrplAccount, null);
                    }

                    console.log("bithompUserNames size: " + this.bithompUserNames.size);
                }
            }
        } catch(err) {
            console.log("err retrieving single addresse from bithomp");
            console.log(err);
        }   
    }

    async resolveKycStatus(xrplAccount: string): Promise<void> {
        try {
            if(!this.kycMap.has(xrplAccount)) {

                //console.log("RESOLVING KYC FOR: " + xrplAccount);
                let kycResponse:any = await fetch.default("https://xumm.app/api/v1/platform/kyc-status/" + xrplAccount + "?include_globalid=true")
                
                if(kycResponse && kycResponse.ok) {
                    let kycInfo:any = await kycResponse.json();
            
                    //console.log("resolved: " + JSON.stringify(kycInfo));
                    if(kycInfo) {
                        this.kycMap.set(xrplAccount, kycInfo.kycApproved)
                    } else {
                        this.kycMap.set(xrplAccount, null);
                    }

                    //console.log("kycMap size: " + this.kycMap.size);
                }
            }

            //resolve distributor account status!
            if(this.kycDistributorMap && this.kycDistributorMap.has(xrplAccount) && this.kycDistributorMap.get(xrplAccount) != null && !this.kycMap.has(this.kycDistributorMap.get(xrplAccount))) {
                let distributorAccount:string = this.kycDistributorMap.get(xrplAccount);
                //console.log("resolving kyc for distributor account: " + distributorAccount);
                let kycResponse:any = await fetch.default("https://xumm.app/api/v1/platform/kyc-status/" + distributorAccount + "?include_globalid=true")
                
                if(kycResponse && kycResponse.ok) {
                    let kycInfo:any = await kycResponse.json();
            
                    //console.log("resolved: " + JSON.stringify(kycInfo));
                    if(kycInfo) {
                        this.kycMap.set(distributorAccount, kycInfo.kycApproved)
                    } else {
                        this.kycMap.set(distributorAccount, null);
                    }

                    //console.log("kycMap size: " + this.kycMap.size);
                }
            }
        } catch(err) {
            console.log("err retrieving kyc status for " + xrplAccount);
            console.log(err);
        }   
    }

    async initAccountName(xrplAccount:string): Promise<void> {
        if(this.bithompServiceNames.has(xrplAccount)) {
            return;

        } else if(this.xrpscanUserNames.has(xrplAccount)) {
            return;
        
        } else if(this.bithompUserNames.has(xrplAccount)) {
            return;

        } else {
            //try to resolve user name - seems like it is a new one!
            return this.loadBithompSingleAccountName(xrplAccount);
        }
    }

    public async saveBithompUserNamesToFS(): Promise<void> {
        if(this.bithompUserNames && this.bithompUserNames.size > 0) {
            let bithompNames:any = {};
            this.bithompUserNames.forEach((value, key, map) => {
                if(value) {
                    bithompNames[key] = value;
                }
            });
            fs.writeFileSync("./../bithompUserNames_new.js", JSON.stringify(bithompNames));
            fs.renameSync("./../bithompUserNames_new.js", "./../bithompUserNames.js");

            //console.log("saved " + this.bithompUserNames.size + " user names to file system");
        }
    }

    private async loadBithompUserNamesFromFS(): Promise<void> {
        //console.log("loading bithomp user names from FS");
        try {
            if(fs.existsSync("./../bithompUserNames.js")) {
                let bithompNames:any = JSON.parse(fs.readFileSync("./../bithompUserNames.js").toString());
                //console.log(JSON.stringify(bithompNames));
                if(bithompNames) {
                    for (var account in bithompNames) {
                        if (bithompNames.hasOwnProperty(account)) {
                            this.bithompUserNames.set(account, bithompNames[account] != null ? bithompNames[account] : "");
                        }
                    }

                    //console.log("loaded " + this.bithompUserNames.size + " user names from file system");
                }
            } else {
                console.log("bithomp user name file does not exist yet.")
            }
        } catch(err) {
            console.log("error reading bithomp user names from FS");
            console.log(err);
            this.bithompUserNames.clear();
        }
    }

    public async saveKycDataToFS(): Promise<void> {
        if(this.kycMap && this.kycMap.size > 0) {
            let kycData:any = {};
            this.kycMap.forEach((value, key, map) => {
                if(value) {
                    kycData[key] = value;
                }
            });
            fs.writeFileSync("./../kycData_new.js", JSON.stringify(kycData));
            fs.renameSync("./../kycData_new.js", "./../kycData.js");

            //console.log("saved " + this.kycMap.size + " kyc data to file system");
        }
    }

    private async loadKycDataFromFS(): Promise<void> {
        //console.log("loading kyc data from FS");
        try {
            if(fs.existsSync("./../kycData.js")) {
                let kycData:any = JSON.parse(fs.readFileSync("./../kycData.js").toString());
                //console.log(JSON.stringify(bithompNames));
                if(kycData) {
                    for (var account in kycData) {
                        if (kycData.hasOwnProperty(account)) {
                            this.kycMap.set(account, kycData[account]);
                        }
                    }

                    //console.log("loaded " + this.kycMap.size + " kyc data from file system");
                }
            } else {
                console.log("kyc data file does not exist yet.")
            }
        } catch(err) {
            console.log("error reading kyc data file from FS");
            console.log(err);
            this.kycMap.clear();
        }
    }
}