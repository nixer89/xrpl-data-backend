import * as config from './util/config';
import * as scheduler from 'node-schedule';
import * as ripple from 'ripple-lib';
import { LedgerDataRequest, LedgerDataResponse } from 'ripple-lib';
import consoleStamp = require("console-stamp");
import { RippleStateLedgerEntry } from 'ripple-lib/dist/npm/common/types/objects';

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

const fastify = require('fastify')({trustProxy: config.USE_PROXY})

let issuers_1: Map<string, number> = new Map();
let issuers_2: Map<string, number> = new Map();
let ledger_1: number;
let ledger_2: number;

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
    scheduler.scheduleJob("readIssuedToken", {minute: 10}, async () => { await readIssuedToken(null, null); load1=!load1});
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
}

async function readIssuedToken(ledgerIndex:string, marker:string): Promise<void> {
  //console.log("new call: ledgerIndex: " + ledgerIndex);
  console.log("new call: marker: " + marker);

  let ledger_data:LedgerDataRequest = {
    limit: 100000
  }

  if(ledgerIndex)
    ledger_data.ledger_index = ledgerIndex;

  if(marker)
    ledger_data.marker = marker;

    
  if(!websocket)
    websocket = new ripple.RippleAPI({server: "wss://xrpl.ws", proxy: config.USE_PROXY ? config.PROXY_URL : null, timeout: 60000});

  await websocket.connect();


  console.log("connected to xrpl.ws");
  console.log("calling with: " + JSON.stringify(ledger_data));

  let message:LedgerDataResponse;
  try { 
    message = await websocket.request('ledger_data', ledger_data);
  } catch(err) {
    console.log(err);
  }


  console.log("got response: " + JSON.stringify(message).substring(0,1000));

  if(message && message.state && message.ledger_index) {
    let newledgerIndex:string = message.ledger_index;
    let newMarker:string = message.marker;

    console.log("marker: " + newMarker);
    console.log("ledger_index: " + newledgerIndex);
    let rippleStates:RippleStateLedgerEntry[] = message.state.filter(element => element.LedgerEntryType === 'RippleState');

    for(let i = 0; i < rippleStates.length; i++) {
      let balance:number = Number.parseFloat(rippleStates[i].Balance.value);
      let currency:string = rippleStates[i].Balance.currency;
      let issuer:string = balance > 0 ? rippleStates[i].HighLimit.issuer : rippleStates[i].LowLimit.issuer;

      balance = balance < 0 ? balance * -1 : balance;
      issuer = issuer + "_" + currency;

      if(balance > 0) {
        //console.log("issuer: " + issuer);
        //console.log("balance: " + balance);

        addIssuer(issuer, balance);
      }
    }

    console.log("done");

    console.log("issuer size: " + load1 ? issuers_1.size : issuers_2.size);
    if(newledgerIndex != null && newMarker != null)
        await readIssuedToken(newledgerIndex, newMarker);
    else {
      console.log("Done 1 - issuer size: " + load1 ? issuers_1.size : issuers_2.size);
    }

  } else {
    console.log("Done 2 - issuer size: " + load1 ? issuers_1.size : issuers_2.size);
  }
}

function addIssuer(issuer:string, balance:number): void {
  if(hasIssuer(issuer))
    addExistingIssuer(issuer, balance);
  else
    addNewIssuer(issuer, balance);
}

function hasIssuer(issuer: string) : boolean {
  if(load1)
    return issuers_1.has(issuer);
  else
    return issuers_2.has(issuer);
}

function addNewIssuer(issuer:string, balance: number): void {
  if(load1)
    issuers_1.set(issuer, balance);
  else
    issuers_2.set(issuer, balance);
}

function getIssuerData(issuer:string): number {
  if(load1)
    return issuers_1.get(issuer);
  else
    return issuers_2.get(issuer);
}

function addExistingIssuer(issuer: string, balance:number) {
  let newBalance:number = getIssuerData(issuer)+balance;
  //console.log("setting issuer old");
  addNewIssuer(issuer, newBalance);
}

console.log("running server");
start();