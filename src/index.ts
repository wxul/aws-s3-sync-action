import * as core from "@actions/core";
import { Config, S3 } from "aws-sdk";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { AWSHelper } from "./aws";
import { Scheduler } from "./schedule";
import { checkFiles, convertPath, getFiles } from "./utils";

process.env['AWS_OUTPUT'] = 'json';

async function run() {
  const bucket = core.getInput("aws_bucket_name", { required: true });
  const distributionId = core.getInput("aws_cloudfront_distribution_id");

  const path = core.getInput("source", { required: true });
  const compare = core.getInput("compare").toLowerCase() === "true";
  let concurrent = Number(core.getInput("concurrent")) || 4;
  const ifFailed = core.getInput("if_has_failed");

  // check path
  const existed = checkFiles(path);
  const files = getFiles(path);
  if (files.length === 0) {
    core.warning("Nothing need to upload");
    return;
  }

  // create s3
  const credentials = await AWSHelper.GetCredentials();
  const config = new Config({
    credentials,
  });
  const s3 = new S3(config);

  // compare files
  const totalFiles = files.map(([filename, folder]) => {
    return convertPath(join(folder, filename));
  });
  let needToUploadFiles: string[] = [];
  const uploadedFiles: string[] = [];
  const failedFiles: string[] = [];

  if (compare) {
    await new Promise((rs, reject) => {
      const sche = new Scheduler(concurrent, rs);
      totalFiles.forEach((key) => {
        sche.add(async () => {
          const file = readFileSync(resolve(path, key));
          const hasSameFile = await AWSHelper.CompareETag(
            s3,
            bucket,
            key,
            file
          );
          if (!hasSameFile) {
            needToUploadFiles.push(key);
          }
        });
      });
    });
  } else {
    needToUploadFiles = totalFiles.slice(0);
  }

  if (needToUploadFiles.length === 0) {
    core.warning("Nothing need to upload after compare Etag");
    return;
  } else {
    core.info(
      `Total: ${totalFiles.length}, Need to upload: ${needToUploadFiles.length}`
    );
  }

  // upload
  await new Promise((rs, reject) => {
    const sche = new Scheduler(concurrent, rs);
    needToUploadFiles.forEach((key) => {
      sche.add(async () => {
        const file = readFileSync(resolve(path, key));
        try {
          const data = await AWSHelper.UploadFile(s3, bucket, key, file);
          core.info(`Uploaded: ${data.Key}`);
          uploadedFiles.push(key);
        } catch (error) {
          failedFiles.push(key);
          if (ifFailed === "fail") {
            reject(error);
          }
        }
      });
    });
  });

  if (failedFiles.length > 0) {
    core.info(`Failed: `);
    failedFiles.forEach((k) => {
      core.info(`  ${k}`);
    });
  }

  core.setOutput("uploaded_files", uploadedFiles);

  // create invalidation
  if (distributionId) {
    try {
      const data = await AWSHelper.CreateInvalidation(
        distributionId,
        uploadedFiles
      );
      core.info("Invalidation Created.");
      core.setOutput("invalidation_id", data.Invalidation?.Id);
      core.info(JSON.stringify(data, null, 2));
    } catch (error) {
      core.warning(error.message);
    }
  }
}

run().catch((error) => {
  core.setOutput("error_message", error.message);
  core.error(error.message);
  core.setFailed(error.message);
});
