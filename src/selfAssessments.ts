import * as fetch from 'node-fetch';
import * as fs from 'fs';
import * as scheduler from 'node-schedule';
import { DATA_PATH } from './util/config';

require("log-timestamp");

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
        try {
            if(this.selfAssessments && this.selfAssessments.size > 0) {
                let selfAssessmentsObject:any = {};
                this.selfAssessments.forEach((value, key, map) => {
                    selfAssessmentsObject[key] = value;
                });
                fs.writeFileSync(DATA_PATH+"selfAssessments_new.js", JSON.stringify(selfAssessmentsObject));
                fs.renameSync(DATA_PATH+"selfAssessments_new.js", DATA_PATH+"selfAssessments.js");

                //console.log("saved " + this.selfAssessments.size + " self assessments to file system");
            }
        } catch(err) {
            console.log(err);
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
            console.log("err loading self assessment data from API")
            console.log(JSON.stringify(err));
            return null;
        }
    }
}