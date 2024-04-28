import AWSSDK from 'aws-sdk'
import config from "./config.js";
import _ from "lodash";
import {sendSlackNotification} from "./common.js";

const ID = config.AWS_ACCESS_KEY_ID;
const SECRET = config.AWS_SECRET_KEY;

export default class AWS {
    constructor() {
        this.s3 = new AWSSDK.S3({
            accessKeyId: ID,
            secretAccessKey: SECRET
        });

        this.ec2 = new AWSSDK.EC2({
            accessKeyId: ID,
            secretAccessKey: SECRET,
            region: 'us-east-1'
        });
    }

    async uploadToS3(bucket, fileName, data, metadata = {}) {
        let params = {
            Bucket: bucket,
            Key: fileName,
            Body: data
        };

        params = _.extend({}, params, metadata);

        return await new Promise((resolve, reject) => {
            this.s3.upload(params, function(err, data) {
                if (err) throw err;
                console.log(`File uploaded successfully. ${data.Location}`);
                resolve(data.Location);
            });
        })
    }

    async getFromS3(Bucket, Delimiter = '', Prefix = '', Marker = '', metadata = {}) {
        let params = {
            Bucket,
            Delimiter,
            Prefix,
            Marker
        };

        params = _.extend({}, params, metadata);

        return await new Promise(async (resolve, reject) => {
            this.s3.listObjects(params, function(err, data) {
                if (err) throw err;
                console.log(`Fetched objects from S3 successfully.`);
                resolve(data);
            });
        })
    }

    async deleteFromS3(Bucket, Objects, metadata = {}) {
        let params = {
            Bucket,
            Delete: {
                Objects
            }
        };

        params = _.extend({}, params, metadata);

        return await new Promise(async (resolve, reject) => {
            this.s3.deleteObjects(params, function(err, data) {
                if (err) throw err;
                console.log(`Deleted ${data.Deleted.length} objects from S3 successfully.`);
                resolve(data);
            });
        })
    }

    async setWorkerFleetsTargetCapacity(visualProcessingCapacity, pageDownloadCapacity, functionalTestingCapacity) {
        await sendSlackNotification({text: `Modifying Spot fleet requests (pageDownload - ${pageDownloadCapacity} | visualProcessing - ${visualProcessingCapacity} | functionalTesting - ${functionalTestingCapacity})`});

        let paramsArray = [
            { SpotFleetRequestId: config.AWS_VISUAL_ERROR_PROCESSING_SPOT_FLEET_ID, TargetCapacity: visualProcessingCapacity }, // visualProcessingParams
            { SpotFleetRequestId: config.AWS_PAGE_DOWNLOAD_PROCESSING_SPOT_FLEET_ID, TargetCapacity: pageDownloadCapacity }, // pageDownloadParams
            { SpotFleetRequestId: config.AWS_FUNCTIONAL_TESTING_SPOT_FLEET_ID, TargetCapacity: functionalTestingCapacity }, // functionalTestingParams
        ];

        for (let params of paramsArray) {
            if (params.TargetCapacity === undefined) continue;

            try {
                //todo check why is this throwing FleetNotInModifiableState error but it works ok
                await this.ec2.modifySpotFleetRequest(params, (err, data) => {
                    if (err) console.log(`Cannot modify spot fleet target capacity of ${params.SpotFleetRequestId}`, err);
                    else console.log(`Modified spot fleet target capacity of ${params.SpotFleetRequestId} to ${params.TargetCapacity}`);
                }).promise();
            } catch (e) {
            }
        }
    }

    async getWorkerFleetsTargetCapacity() {
        return await new Promise((resolve, reject) => {
            this.ec2.describeSpotFleetRequests({ SpotFleetRequestIds: [config.AWS_VISUAL_ERROR_PROCESSING_SPOT_FLEET_ID, config.AWS_PAGE_DOWNLOAD_PROCESSING_SPOT_FLEET_ID, config.AWS_FUNCTIONAL_TESTING_SPOT_FLEET_ID] }, function(err, data) {
                if (err) throw err;
                resolve(data.SpotFleetRequestConfigs.map(d => { return {id: d.SpotFleetRequestId, targetCapacity: d.SpotFleetRequestConfig.TargetCapacity}}));
            });
        })
    }
}
