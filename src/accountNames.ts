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
    }

    public static get Instance(): AccountNames
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    private async loadBithompSingleAccountName(xrplAccount: string): Promise<void> {
        try {
            if(!this.bithompServiceNames.has(xrplAccount) && !this.xrpscanUserNames.has(xrplAccount) && !this.bithompUserNames.has(xrplAccount)) {
                console.log("resolving: " + xrplAccount);
                let bithompResponse:any = await fetch.default("https://bithomp.com/api/v2/address/"+xrplAccount+"?username=true&verifiedDomain=true", {headers: { "x-bithomp-token": config.BITHOMP_TOKEN }})
                
                if(bithompResponse && bithompResponse.ok) {
                    let accountInfo:any = await bithompResponse.json();
            
                    console.log("resolved: " + JSON.stringify(accountInfo));
                    if(accountInfo) {
                        let username:string = accountInfo.username ? accountInfo.username : "";
                        let verifiedDomain:string = accountInfo.verifiedDomain;

                        this.bithompUserNames.set(xrplAccount, {resolvedBy: "Bithomp", account: xrplAccount, domain: verifiedDomain, verified: (verifiedDomain && verifiedDomain.trim().length > 0 ? true : false), username: username, twitter: null});
                    }

                    console.log("bithompUserNames size: " + this.bithompUserNames.size);
                }
            }
        } catch(err) {
            console.log("err retrieving single addresse from bithomp");
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
}