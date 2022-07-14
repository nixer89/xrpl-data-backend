import consoleStamp = require("console-stamp");
import { LedgerScanner } from './ledgerScanner';
import { SelfAssessments } from "./selfAssessments";

let ledgerScanner:LedgerScanner = LedgerScanner.Instance;
let selfAssessments:SelfAssessments = SelfAssessments.Instance;

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

// Run the server!
const start = async () => {
  setTimeout(() => {
    //selfAssessments.init();
    ledgerScanner.init();
  },0);
}

console.log("running server");
start();