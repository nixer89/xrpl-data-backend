import * as fs from 'fs';
import consoleStamp = require("console-stamp");
const numeral = require('numeral')
const JSONStream = require('JSONStream')

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class AccountData {

    private static _instance: AccountData;

    ledger = null
    calls = 0
    records = 0
    lastMarker = ''
    transformStream
    outputStream

    private constructor() { }

    public static get Instance(): AccountData
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async resolveAccountData(wsMessage:any): Promise<void> {   

      const r = wsMessage;

      if (this.ledger === null) {
        if (typeof r.error_message === 'undefined') {
          this.ledger = r.result.ledger
          console.log('Now fetching XRP ledger', this.ledger.ledger_index)
          console.log('')
          console.log(' -- Ledger close time:  ', this.ledger.close_time_human)
          console.log(' -- Ledger hash:        ', this.ledger.hash)
          console.log(' -- Total XRP existing: ', numeral(parseInt(this.ledger.total_coins) / 1000000).format('0,0.000000'))
          console.log('')

          let filename = this.ledger.ledger_index + '.json'
          let stats = {
            hash: this.ledger.hash,
            ledger_index: parseInt(this.ledger.ledger_index),
            close_time_human: this.ledger.close_time_human,
            total_coins: parseInt(this.ledger.total_coins) / 1000000
          }
          this.transformStream = JSONStream.stringify('{\n  "stats": ' + JSON.stringify(stats) + ',\n  "balances": [\n    ', ',\n    ', '\n  ]\n}\n')
          this.outputStream = fs.createWriteStream('./../ledgerdata/' + filename)
          this.transformStream.pipe(this.outputStream)
          this.outputStream.on('finish', function handleFinish () {
            console.log('')
            console.log('Done! wrote records:', this.records, 'to:', './data/' + filename)
            console.log('')
            console.log('Now you can retrieve the stats for this ledger by running:')
            console.log('  npm run stats ' + this.ledger.ledger_index)
            console.log('')
            process.exit(0)
          })

        }
      } else {
        //console.log("r.status: " + r.status);
        //console.log("r.type: " + r.type);
        //console.log(JSON.stringify(r));

        if (r) {
          if (r.result.state !== null) {

            let accountRoots:any[] = r.result.state.filter(state => state.LedgerEntryType === 'AccountRoot');

            accountRoots.forEach((i) => {  
              if(i.LedgerEntryType === 'AccountRoot') {
                this.records++
                this.transformStream.write({ a: i.Account, b: parseInt(i.Balance) / 1000000 })
              }
            });
          }
          
          console.log('  > Retrieved '  + this.records + ' accounts in ' + this.calls + ' calls to rippled...' + "\r");

          if (typeof r.result.marker === 'undefined' || r.result.marker === null || r.result.marker === this.lastMarker) {
            // No new marker
            console.log('')

            this.transformStream.end()
          }
        } else {
          throw new Error('Response error...')
        }
      }
    }
}