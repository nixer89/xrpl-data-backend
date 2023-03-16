import { LedgerScanner } from './ledgerScanner';
import { SelfAssessments } from "./selfAssessments";
import * as fs from 'fs';
import { DATA_PATH } from "./util/config";

let ledgerScanner:LedgerScanner = LedgerScanner.Instance;
let selfAssessments:SelfAssessments = SelfAssessments.Instance;

require("log-timestamp");

// Run the server!
const start = async () => {
  setTimeout(() => {

    if(!fs.existsSync(DATA_PATH))
      fs.mkdirSync(DATA_PATH);

    selfAssessments.init();
    ledgerScanner.init();
  },0);
}

console.log("running server");
start();