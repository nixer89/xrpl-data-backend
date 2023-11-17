import * as fs from 'fs';
import { DATA_PATH } from './util/config';

require("log-timestamp");

export class HookData {

    private static _instance: HookData;

    private Hook: any[] = [];
    private HookDefinition: any[] = [];
    private HookState: any[] = [];

    private current_ledger_index: number = -1;
    private current_ledger_date: string;
    private current_ledger_time_ms: number;
    private current_ledger_hash: string;

    private constructor() { }

    public static get Instance(): HookData
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async resolveHookData(ledgerState:any): Promise<void> {   

      let hooks:any[] = ledgerState.filter(element => element.LedgerEntryType === 'Hook');
      let hooksDefinition:any[] = ledgerState.filter(element => element.LedgerEntryType === 'HookDefinition');
      let hooksState:any[] = ledgerState.filter(element => element.LedgerEntryType === 'HookState');

      this.Hook = this.Hook.concat(hooks);
      this.HookDefinition = this.HookDefinition.concat(hooksDefinition);
      this.HookState = this.HookState.concat(hooksState);
    }

    public clearData() {
        this.Hook = [];
        this.HookDefinition = [];
        this.HookState = [];
    }

    public async saveHookDataToFS(): Promise<void> {
      try {
        let currentWrittenLedger = await this.readCurrentLedgerFromFS();

        if(this.getCurrentLedgerIndex() > currentWrittenLedger) {
          console.time("saveHookDataToFS");

          console.log("writing this.Hook.length: " + this.Hook.length);

          let hookData:any = {
            ledger_index: this.getCurrentLedgerIndex(),
            ledger_hash: this.getCurrentLedgerHash(),
            ledger_close: this.getCurrentLedgerCloseTime(),
            ledger_close_ms: this.getCurrentLedgerCloseTimeMs(),
            hooks: this.Hook
          };

          console.log("writing this.HookDefinition.length: " + this.HookDefinition.length);

          let hookDefinitionData:any = {
            ledger_index: this.getCurrentLedgerIndex(),
            ledger_hash: this.getCurrentLedgerHash(),
            ledger_close: this.getCurrentLedgerCloseTime(),
            ledger_close_ms: this.getCurrentLedgerCloseTimeMs(),
            hookDefinitions: this.HookDefinition
          };

          console.log("writing this.HookState.length: " + this.HookState.length);

          let hookStateData:any = {
            ledger_index: this.getCurrentLedgerIndex(),
            ledger_hash: this.getCurrentLedgerHash(),
            ledger_close: this.getCurrentLedgerCloseTime(),
            ledger_close_ms: this.getCurrentLedgerCloseTimeMs(),
            hookStates: this.HookState
          };


          fs.writeFileSync(DATA_PATH+"hooks/hooks.js", JSON.stringify(hookData));
          fs.writeFileSync(DATA_PATH+"hooks/hookDefinitions.js", JSON.stringify(hookDefinitionData));
          fs.writeFileSync(DATA_PATH+"hooks/hookStates.js", JSON.stringify(hookStateData));

          console.timeEnd("saveHookDataToFS");
        } else {
          console.log("this.getCurrentLedgerIndex(): " + this.getCurrentLedgerIndex());
          console.log("currentWrittenLedger: " + currentWrittenLedger);
        }
      } catch(err) {
        console.log(err);
      }
    }

    public async readCurrentLedgerFromFS(): Promise<number> {
      try {
        //console.log("loading nft issuer data from FS");
        if(fs.existsSync(DATA_PATH+"uri_tokens/uriTokenData_1.js")) {
            let uriTokenData:any = JSON.parse(fs.readFileSync(DATA_PATH+"uri_tokens/uriTokenData_1.js").toString());
            if(uriTokenData && uriTokenData.ledger_index) {
                return uriTokenData.ledger_index;
            } else {
              return -1;
            }
        } else {
          console.log("uri token data file does not exist yet.")
          return -1;
        }
      } catch(err) {
        console.log("error reading uri token data from FS");
        console.log(err);
        return -1;
      }  
    }

    public getCurrentLedgerIndex(): number {
      return this.current_ledger_index;
    }

    public setCurrentLedgerIndex(index:number): void {
        this.current_ledger_index = index;
    }

    public getCurrentLedgerHash(): string {
        return this.current_ledger_hash;
    }

    public setCurrentLedgerHash(hash:string): void {
        this.current_ledger_hash = hash;
    }

    public getCurrentLedgerCloseTime(): string {
        return this.current_ledger_date;
    }

    public setCurrentLedgerCloseTime(closeTime: string): void {
        this.current_ledger_date = closeTime;
    }

    public getCurrentLedgerCloseTimeMs(): number {
        return this.current_ledger_time_ms;
    }

    public setCurrentLedgerCloseTimeMs(closeTimeInMs: number): void {
        this.current_ledger_time_ms = closeTimeInMs;
    }
  }