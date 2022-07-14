import { MongoClient, Collection } from 'mongodb';
import { IssuerTokenTableEntry, LedgerDataTableEntry, KycDataTableEntry, TokenCreationTableEntry } from './util/types';
require('console-stamp')(console, { 
    format: ':date(yyyy-mm-dd HH:MM:ss) :label' 
});

export class DB {
    dbIp = process.env.DB_IP || "127.0.0.1"

    issuerTokenCollection:Collection<IssuerTokenTableEntry> = null;
    ledgerDataCollection:Collection<LedgerDataTableEntry> = null;
    tokenCreationCollection:Collection<TokenCreationTableEntry> = null;
    kycDataCollection:Collection<KycDataTableEntry> = null;

    issuerTokenCache:IssuerTokenTableEntry[] = null;
    ledgerDataCache: LedgerDataTableEntry[] = null;
    tokenCreationCache: TokenCreationTableEntry[] = null;
    kycDataCache: KycDataTableEntry[] = null;

    latestIssuerTokenData:IssuerTokenTableEntry = null;

    async initDb(from: string): Promise<void> {
        console.log("init mongodb from: " + from);
        this.issuerTokenCollection = await this.getNewDbModel("IssuerTokenCollection");
        this.ledgerDataCollection = await this.getNewDbModel("LedgerDataCollection");
        this.tokenCreationCollection = await this.getNewDbModel("TokenCreationCollection");
        this.kycDataCollection = await this.getNewDbModel("KycDataCollection");
        
        return Promise.resolve();
    }

    async insertIssuerTokenData(issuerTokenData:IssuerTokenTableEntry): Promise<any> {
        //console.log("[DB]: saveUser:" + " origin: " + origin + " userId: " + userId + " xummId: " + xummId);
        try {
            await this.issuerTokenCollection.insertOne(issuerTokenData);

            //fill cache
            this.latestIssuerTokenData = issuerTokenData;
            this.issuerTokenCache.push(issuerTokenData);

        } catch(err) {
            console.log("[DB]: error insertIssuerTokenData");
            console.log(err);
        }
    }

    async getLatestIssuerTokenData(): Promise<IssuerTokenTableEntry> {
        try {
            if(this.latestIssuerTokenData)
                return this.latestIssuerTokenData;
            else {
                return this.issuerTokenCollection.find().sort({ledger_index:-1}).limit(1).toArray()[0];
            }
        } catch(err) {
            console.log("[DB]: error getLatestIssuerTokenData");
            console.log(err);
        }
    }

    async getNewDbModel(collectionName: string): Promise<Collection<any>> {
        try {
            console.log("[DB]: connecting to mongo db with collection: " + collectionName +" and an schema");
            let connection:MongoClient = await MongoClient.connect('mongodb://'+this.dbIp+':27017');
            connection.on('error', ()=>{console.log("[DB]: Connection to MongoDB could NOT be established")});
        
            if(connection) {
                let existingCollections:Collection<any>[] = await connection.db('XummBackend').collections();
                //create collection if not exists
                if(existingCollections.filter(collection => collection.collectionName === collectionName).length == 0)
                    await connection.db('XummBackend').createCollection(collectionName);

                return connection.db('XummBackend').collection(collectionName);
            }
            else
                return null;
        } catch(err) {
            console.log(err);
            return null;
        }
    }

    async ensureIndexes(): Promise<void> {
        try {
            console.log("ensureIndexes");
            //AllowedOrigins
            if(!(await this.applicationApiKeysCollection.indexExists("origin_-1")))
                await this.allowedOriginsCollection.createIndex({origin: -1});

            

        } catch(err) {
            console.log("ERR creating indexes");
            console.log(JSON.stringify(err));
        }
    }

    resetCache() {
        this.issuerTokenCache = null;
        this.ledgerDataCache = null;
        this.kycDataCache = null;
        this.tokenCreationCache = null;
        console.log("[DB]: CACHE has been reset!");
    }
}