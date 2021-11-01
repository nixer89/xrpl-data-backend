import consoleStamp = require("console-stamp");
import { LedgerScanner } from './ledgerScanner';

let ledgerScanner:LedgerScanner = LedgerScanner.Instance;

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

// Run the server!
const start = async () => {
  setTimeout(() => ledgerScanner.init(),0);
}

console.log("running server");
start();