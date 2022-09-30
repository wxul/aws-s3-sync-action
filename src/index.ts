import * as core from "@actions/core";
import { Config, S3 } from "aws-sdk";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { AWSHelper } from "./aws";
import { Scheduler } from "./schedule";
import { checkFiles, convertPath, getFiles } from "./utils";

process.env["AWS_OUTPUT"] = "json";

async function run() {
  const begin = Date.now();
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
    core.info(`[Time:Compare:Begin]: ${Date.now() - begin}`);
    await new Promise((rs, reject) => {
      const sche = new Scheduler(100, rs);
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
    core.info(`[Time:Compare:End]: ${Date.now() - begin}`);
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
  core.info(`[Time:Upload:Begin]: ${Date.now() - begin}`);
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
  core.info(`[Time:Upload:End]: ${Date.now() - begin}`);

  if (failedFiles.length > 0) {
    core.info(`Failed: `);
    failedFiles.forEach((k) => {
      core.info(`  ${k}`);
    });
  }

  core.setOutput("uploaded_files", uploadedFiles);

  // create invalidation
  if (distributionId) {
    core.info(`[Time:Invalidation:Begin]: ${Date.now() - begin}`);
    try {
      const data = await AWSHelper.CreateInvalidation(
        distributionId,
        uploadedFiles
      );
      core.info("Invalidation Created.");
      core.setOutput("invalidation_id", data.Invalidation?.Id);
      core.info(JSON.stringify(data, null, 2));
    } catch (error) {
      core.warning("Create invalidation failed");
      core.warning(error.message);
    } finally {
      core.info(`[Time:Invalidation:End]: ${Date.now() - begin}`);
    }
  }
  core.info(`[Time:End]: ${Date.now() - begin}`);
}

run().catch((error) => {
  core.setFailed(error.message);
});
