import * as config from './util/config';
import consoleStamp = require("console-stamp");
import { IssuerAccounts } from './issuerAccounts';
import { LedgerScanner } from './ledgerScanner';
import { LedgerData } from './ledgerData';

let issuerAccount:IssuerAccounts;
let ledgerData:LedgerData;
let ledgerScanner:LedgerScanner;

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

const fastify = require('fastify')({trustProxy: config.USE_PROXY})

console.log("adding response compression");
fastify.register(require('fastify-compress'));

console.log("adding some security headers");
fastify.register(require('fastify-helmet'));

// Run the server!
const start = async () => {

  issuerAccount = IssuerAccounts.Instance
  ledgerData = LedgerData.Instance;
  ledgerScanner = LedgerScanner.Instance

    console.log("starting server");
    try {
      //init routes
      console.log("adding cors");

      fastify.register(require('fastify-cors'), {
        origin: ["https://xumm.community", "https://test.xumm.community", "http://localhost:4200"],
        methods: 'GET, OPTIONS',
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'Referer']
      });

      fastify.get('/api/v1/tokens', async (request, reply) => {
        //console.log("request params: " + JSON.stringify(request.params));
        let issuers = issuerAccount.getLedgerTokensV1(ledgerScanner.getLoad());
        return {
          ledger_index: ledgerScanner.getLedgerIndex(),
          ledger_hash: ledgerScanner.getLedgerHash(),
          ledger_close: ledgerScanner.getLedgerCloseTime(),
          ledger_close_ms: ledgerScanner.getLedgerCloseTimeMs(),
          tokens: issuers
        }
      });

      fastify.get('/api/v1/ledgerdata', async (request, reply) => {
        let ledgerDataObjects = ledgerData.getLedgerDataV1(ledgerScanner.getLoad());
        //console.log("ledgerDataObjects: " + JSON.stringify(ledgerDataObjects));
        return {
          ledger_index: ledgerScanner.getLedgerIndex(),
          ledger_hash: ledgerScanner.getLedgerHash(),
          ledger_close: ledgerScanner.getLedgerCloseTime(),
          ledger_close_ms: ledgerScanner.getLedgerCloseTimeMs(),
          ledger_data: ledgerDataObjects
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

    setTimeout(() => ledgerScanner.init(),0);
    
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

console.log("running server");
start();