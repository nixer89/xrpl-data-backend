import { LedgerScanner } from './ledgerScanner';
import * as fs from 'fs';
import { DATA_PATH } from "./util/config";

let ledgerScanner:LedgerScanner = LedgerScanner.Instance;

require("log-timestamp");

// Run the server!
const start = async () => {
  setTimeout(async () => {

    if(!fs.existsSync(DATA_PATH))
      fs.mkdirSync(DATA_PATH);

    ledgerScanner.init();
  },0);
}

console.log("running server");
start();