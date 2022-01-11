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
    }

    private async appendIssuerCreationToFS(issuerKey:string, creation: any): Promise<void> {
        fs.appendFileSync("./../issuerCreation.txt", issuerKey+"="+JSON.stringify(creation)+"\n");

        console.log("saved " + issuerKey+"="+JSON.stringify(creation) + " to issuer creation file on file system");
    }

    isTokenInCache(issuerTokenKey:string) {
        return this.tokenCreation && this.tokenCreation.has(issuerTokenKey) && this.tokenCreation.get(issuerTokenKey) != null;
    }
}