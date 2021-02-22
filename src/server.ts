import * as config from './util/config';
import consoleStamp = require("console-stamp");
import { IssuerAccounts } from './issuerAccounts';

let issuerAccount:IssuerAccounts = new IssuerAccounts();

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

const fastify = require('fastify')({trustProxy: config.USE_PROXY})

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
        origin: ["https://xumm.community", "https://test.xumm.community", "http://localhost:4200"],
        methods: 'GET, OPTIONS',
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'Referer']
      });

      fastify.get('/tokens', async (request, reply) => {
        //console.log("request params: " + JSON.stringify(request.params));
        return {
          ledger_index: issuerAccount.getLedgerIndex(),
          ledger_hash: issuerAccount.getLedgerHash(),
          ledger_close: issuerAccount.getLedgerCloseTime(),
          ledger_close_ms: issuerAccount.getLedgerCloseTimeMs(),
          tokens: issuerAccount.getLedgerTokens()
        }
      });
      
    console.log("declaring 200er reponse")
    fastify.get('/', async (request, reply) => {
      reply.code(200).send('I am alive!'); 
    });

    try {
      await fastify.listen(4001, '0.0.0.0');

      console.log("http://localhost:4002/");

      fastify.ready(err => {
        if (err) throw err
      });
    } catch(err) {
      console.log('Error starting server:', err)
    }

    setTimeout(() => issuerAccount.init(),0);
    
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

console.log("running server");
start();