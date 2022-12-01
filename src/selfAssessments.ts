import * as fetch from 'node-fetch';
import consoleStamp = require("console-stamp");
import * as fs from 'fs';
import * as scheduler from 'node-schedule';

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class SelfAssessments {

    private static _instance: SelfAssessments;

    private selfAssessments:Map<string, any> = new Map();

    private constructor() { }

    public static get Instance(): SelfAssessments
    {
        // Do you need arguments? Make it a regular static method instead.
        return this._instance || (this._instance = new this());
    }

    public async init(): Promise<void> {
        this.loadSelfAssessmentsFromApi()

        scheduler.scheduleJob("loadSelfAssessmentsFromApi", "*/10 * * * *", () => this.loadSelfAssessmentsFromApi());
    }

    private async saveSelfAssessmentsToFS(): Promise<void> {
        if(this.selfAssessments && this.selfAssessments.size > 0) {
            let selfAssessmentsObject:any = {};
            this.selfAssessments.forEach((value, key, map) => {
                selfAssessmentsObject[key] = value;
            });
            fs.writeFileSync("./../selfAssessments_new.js", JSON.stringify(selfAssessmentsObject));
            fs.renameSync("./../selfAssessments_new.js", "./../selfAssessments.js");

            //console.log("saved " + this.selfAssessments.size + " self assessments to file system");
        }
    }
    private async loadSelfAssessmentsFromApi(): Promise<any> {
        try {
            //try to resolve it from xrplorer.com API
            let apiResponse:fetch.Response = await fetch.default("https://assessments.api.xrplf.org/api/v1/all");
            
            if(apiResponse && apiResponse.ok) {
                let selfAssessmentsArray:any[] = await apiResponse.json();

                selfAssessmentsArray.forEach(assessment => {
                    let key = assessment.issuer + "_" + assessment.currency_code;
                    this.selfAssessments.set(key, assessment);
                });

                await this.saveSelfAssessmentsToFS();
            }
        } catch(err) {
            console.log(JSON.stringify(err));
            return null;
        }
    }
}