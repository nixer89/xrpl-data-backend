import * as config from './util/config';
import * as scheduler from 'node-schedule';
import * as ripple from 'ripple-lib';
import { LedgerDataRequest, LedgerDataResponse, LedgerResponse } from 'ripple-lib';
import consoleStamp = require("console-stamp");
import { Ledger, RippleStateLedgerEntry } from 'ripple-lib/dist/npm/common/types/objects';

interface Currency {
  token: string,
  balance: number
}

interface IssuerAccount {
  issuer: string,
  tokens: Currency[]
}

interface Issuers {
  issuers: IssuerAccount[];
}

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

const fastify = require('fastify')({trustProxy: config.USE_PROXY})

let issuers_1: Map<string, number> = new Map();
let issuers_2: Map<string, number> = new Map();
let ledger_index_1: string;
let ledger_index_2: string;
let ledger_date_1: string;
let ledger_date_2: string;
let ledger_hash_1: string;
let ledger_hash_2: string;

let load1: boolean = true;

let websocket:ripple.RippleAPI;

console.log("adding response compression");
fastify.register(require('fastify-compress'));

console.log("adding some security headers");
fastify.register(require('fastify-helmet'));

// Run the server!
const start = async () => {

    console.log("starting server");
    try {
      //init routes
      console.log("adding cors");

      fastify.register(require('fastify-cors'), {
        origin: ["https://xumm.community", "http://localhost:4200"],
        methods: 'GET, OPTIONS',
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'Referer']
      });

      fastify.get('/tokens', async (request, reply) => {
        //console.log("request params: " + JSON.stringify(request.params));
        if(!load1) {
          return {
            ledger_index: ledger_index_1,
            ledger_hash: ledger_hash_1,
            ledger_close: ledger_date_1,
            tokens: transformIssuers(new Map(issuers_1))
          }
        } else {
          return {
            ledger_index: ledger_index_2,
            ledger_hash: ledger_hash_2,
            ledger_close: ledger_date_2,
            tokens: transformIssuers(new Map(issuers_2))
          }
        }
      });
      
    console.log("declaring 200er reponse")
    fastify.get('/', async (request, reply) => {
      reply.code(200).send('I am alive!'); 
    });

    try {
      await fastify.listen(4001, '0.0.0.0');

      console.log("http://localhost:4001/");

      fastify.ready(err => {
        if (err) throw err
      });
    } catch(err) {
      console.log('Error starting server:', err)
    }

    await readIssuedToken(null, null);
    load1=!load1;

    scheduler.scheduleJob("readIssuedToken", {minute: 0}, async () => { await readIssuedToken(null, null); load1=!load1});
    scheduler.scheduleJob("readIssuedToken", {minute: 30}, async () => { await readIssuedToken(null, null); load1=!load1});
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

async function readIssuedToken(ledgerIndex:string, marker:string): Promise<void> {
  //console.log("new call: ledgerIndex: " + ledgerIndex);
  console.log("new call: marker: " + marker);
  if(!marker) {
    if(load1) {
      issuers_1.clear();
      ledger_date_1 = null;
      ledger_index_1 = null;
      ledger_hash_1 = null;
    } else {
      issuers_2.clear();
      ledger_date_2 = null;
      ledger_index_2 = null;
      ledger_hash_2 = null;
    }
  }


  let ledger_data:LedgerDataRequest = {
    limit: 100000
  }

  if(ledgerIndex)
    ledger_data.ledger_index = ledgerIndex;

  if(marker)
    ledger_data.marker = marker;

  try { 
    if(!websocket)
      websocket = new ripple.RippleAPI({server: "wss://xrpl.ws", proxy: config.USE_PROXY ? config.PROXY_URL : null, timeout: 120000});

    await websocket.connect();


    //console.log("connected to xrpl.ws");
    //console.log("calling with: " + JSON.stringify(ledger_data));

    let message:LedgerDataResponse;
  
    message = await websocket.request('ledger_data', ledger_data);
    


    //console.log("got response: " + JSON.stringify(message).substring(0,1000));

    if(message && message.state && message.ledger_index) {
      let newledgerIndex:string = message.ledger_index;
      let newMarker:string = message.marker;

      console.log("marker: " + newMarker);
      console.log("ledger_index: " + newledgerIndex);
      let rippleStates:RippleStateLedgerEntry[] = message.state.filter(element => element.LedgerEntryType === 'RippleState');

      for(let i = 0; i < rippleStates.length; i++) {
        let amount:number = Number.parseFloat(rippleStates[i].Balance.value);
        let currency:string = rippleStates[i].Balance.currency;
        let issuer:string = amount > 0 ? rippleStates[i].HighLimit.issuer : rippleStates[i].LowLimit.issuer;

        amount = amount < 0 ? amount * -1 : amount;
        issuer = issuer + "_" + currency;

        if(amount > 0) {
          //console.log("issuer: " + issuer);
          //console.log("balance: " + balance);

          addIssuer(issuer, amount);
        }
      }

      //console.log("done");

      console.log("issuer_1 size: " + issuers_1.size);
      console.log("issuer_2 size: " + issuers_2.size);
      if(newledgerIndex != null && newMarker != null)
          return readIssuedToken(newledgerIndex, newMarker);
      else {
        console.log("Done 1");
        console.log("issuer_1 size: " + issuers_1.size);
        console.log("issuer_2 size: " + issuers_2.size);
      }
    } else {
      console.log("Done 2");
      console.log("issuer_1 size: " + issuers_1.size);
      console.log("issuer_2 size: " + issuers_2.size);
    }

    console.log("ALL DONE");

    let ledgerInfo:LedgerResponse = await websocket.request('ledger', {ledger_index: ledgerIndex});

    if(load1) {
      ledger_index_1 = ledgerIndex;
      ledger_hash_1 = ledgerInfo.ledger_hash;
      ledger_date_1 = ledgerInfo.ledger.close_time_human;
    } else {
      ledger_index_2 = ledgerIndex;
      ledger_hash_2 = ledgerInfo.ledger_hash;
      ledger_date_2 = ledgerInfo.ledger.close_time_human;
    }

  } catch(err) {
    console.log(err);
    websocket = null;
    if(marker != null)
      return readIssuedToken(ledgerIndex, marker);
  }
}

function addIssuer(issuer:string, amount:number): void {
  if(hasIssuer(issuer))
    addExistingIssuer(issuer, amount);
  else
    addNewIssuer(issuer, amount);
}

function hasIssuer(issuer: string) : boolean {
  if(load1)
    return issuers_1.has(issuer);
  else
    return issuers_2.has(issuer);
}

function addNewIssuer(issuer:string, amount: number): void {
  if(load1)
    issuers_1.set(issuer, amount);
  else
    issuers_2.set(issuer, amount);
}

function getIssuerData(issuer:string): number {
  if(load1)
    return issuers_1.get(issuer);
  else
    return issuers_2.get(issuer);
}

function addExistingIssuer(issuer: string, amount:number) {
  let newAmount:number = getIssuerData(issuer)+amount;
  //console.log("setting issuer old");
  addNewIssuer(issuer, newAmount);
}

function transformIssuers(issuers: Map<string, number>): any {
  let transformedIssuers:any = {}

  issuers.forEach((value, key, map) => {
    let acc = key.substring(0, key.indexOf("_"));
    let currency = key.substring(key.indexOf("_")+1, key.length);

    if(!transformedIssuers[acc])
      transformedIssuers[acc] = [{currency: currency, amount: value}];
    else
      transformedIssuers[acc].push({currency: currency, amount: value});

  });

  return transformedIssuers;
}

console.log("running server");
start();