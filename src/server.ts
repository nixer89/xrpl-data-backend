import consoleStamp = require("console-stamp");
import { IssuerAccounts } from './issuerAccounts';
import { LedgerScanner } from './ledgerScanner';
import { LedgerData } from './ledgerData';
import { TokenCreation } from './tokenCreation';
import { AccountNames } from "./accountNames";

let issuerAccount:IssuerAccounts;
let ledgerData:LedgerData;
let ledgerScanner:LedgerScanner;
let tokenCreation:TokenCreation;
let accountNames: AccountNames;

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

const fastify = require('fastify')()

console.log("adding response compression");
fastify.register(require('fastify-compress'), { encodings: ['gzip', 'deflate', 'br'] });

console.log("adding some security headers");
fastify.register(require('fastify-helmet'));

// Run the server!
const start = async () => {

  issuerAccount = IssuerAccounts.Instance;
  ledgerData = LedgerData.Instance;
  ledgerScanner = LedgerScanner.Instance;
  tokenCreation = TokenCreation.Instance;
  accountNames = AccountNames.Instance;

    console.log("starting server");
    try {
      await tokenCreation.init();

      //init routes
      console.log("adding cors");

      fastify.register(require('fastify-cors'), {
        origin: "*",
        methods: 'GET, OPTIONS',
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'Referer']
      });

      fastify.get('/api/v1/tokens', async (request, reply) => {
        //console.log("request params: " + JSON.stringify(request.params));
        console.time("tokens");
        let issuers = issuerAccount.getLedgerTokensV1(ledgerScanner.getLoad());
        console.timeEnd("tokens");

        return {
          ledger_index: ledgerScanner.getLedgerIndex(),
          ledger_hash: ledgerScanner.getLedgerHash(),
          ledger_close: ledgerScanner.getLedgerCloseTime(),
          ledger_close_ms: ledgerScanner.getLedgerCloseTimeMs(),
          issuers: issuers
        }
      });

      fastify.get('/api/v1/ledgerdata', async (request, reply) => {
        console.time("ledgerdata");
        let ledgerDataObjects: any[] = await ledgerData.getLedgerDataV1(ledgerScanner.getLoad());
        console.timeEnd("ledgerdata");
        //console.log("ledgerDataObjects: " + JSON.stringify(ledgerDataObjects));
        return {
          ledger_index: ledgerScanner.getLedgerIndex(),
          ledger_hash: ledgerScanner.getLedgerHash(),
          ledger_close: ledgerScanner.getLedgerCloseTime(),
          ledger_close_ms: ledgerScanner.getLedgerCloseTimeMs(),
          ledger_size: ledgerDataObjects[0],
          sizeType: "B",
          ledger_data: ledgerDataObjects[1]
        }
      });

      fastify.get('/api/v1/kyc/:account', async (request, reply) => {
        if(!request.params.account) {
          reply.code(500).send('Please provide an account. Calls without account are not allowed');
      } else {
          try {
              return {
                account: request.params.account,
                kyc: accountNames.getKycData(request.params.account)
              }
          } catch(err) {
              console.log("ERROR: " + JSON.stringify(err));
              reply.code(500).send('Error occured. Please check your request.');
          }
      }
      });

      fastify.get('/api/v1/tokencreation', async (request, reply) => {

        //console.log("query: " + JSON.stringify(request.query));
        let issuer:string = request.query.issuer;
        let currency:string = request.query.currency;

        return tokenCreation.getTokenCreationDate(issuer, currency);
      });
      
    console.log("declaring 200er reponse")
    fastify.get('/api', async (request, reply) => {
      reply.code(200).send('I am alive!'); 
    });

    try {
      await fastify.listen(4002, '0.0.0.0');

      console.log("http://localhost:4002/");

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