const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const createHash = require('etag-hash').createHash;

const params = {
  awsAccessKeyId: core.getInput('AWS_ACCESS_KEY_ID', { required: true }),
  awsSecretAccessKey: core.getInput('AWS_SECRET_ACCESS_KEY', { required: true }),
  awsBucketName: core.getInput('AWS_BUCKET_NAME', { required: true }),
  awsRegion: core.getInput('AWS_REGION', { required: true }),
  source: core.getInput('source', { required: true }),
  compare: core.getInput('compare').toLowerCase() === 'true',
  cloudFrontDistributionId: core.getInput('AWS_CLOUDFRONT_DISTRIBUTION_ID'),
}
process.env['AWS_ACCESS_KEY_ID'] = params.awsAccessKeyId;
process.env['AWS_SECRET_ACCESS_KEY'] = params.awsSecretAccessKey;
process.env['AWS_REGION'] = params.awsRegion;
process.env['AWS_OUTPUT'] = 'json';

const AWS = require('aws-sdk');

const BUCKET_NAME = params.awsBucketName;
const DistributionId = params.cloudFrontDistributionId;
const BASE_DIR = params.source;
const BlockFiles = ['.DS_Store'];

async function main() {
  function getCredentials() {
    return new Promise((resolve, reject) => {
      AWS.config.getCredentials(function (err) {
        if (err) {
          core.info(err.stack);
          reject(err);
        }
        // credentials not loaded
        else {
          resolve(AWS.config.credentials)
        }
      });
    })
  }

  function readFiles(dir, operation) {
    const basepath = path.resolve(BASE_DIR, dir);
    const list = fs.readdirSync(basepath);

    for (let index = 0; index < list.length; index++) {
      const name = list[index];
      const filepath = path.resolve(BASE_DIR, dir, name);
      if (fs.statSync(filepath).isDirectory()) {
        readFiles(path.join(dir, name), operation);
      } else {
        if (typeof operation === 'function' && !BlockFiles.includes(name))
          operation(name, dir)
      }
    }
  }

  function getAllFiles() {
    let fileList = [];
    readFiles('', (filename, dir) => {
      fileList.push([filename, dir]);
    });

    return fileList;
  }

  function getTotal() {
    let total = 0;
    readFiles('', (n, f) => {
      total++;
    });
    return total;
  }

  function checkFiles() {
    if (!fs.existsSync(BASE_DIR)) return false;
    if (getTotal() === 0) return false;
    return true
  }

  function formatS3Key(dir) {
    return dir.replace(/\\/g, '/');
  }

  async function upload() {
    if (!checkFiles()) {
      core.error('path is empty!');
      core.setFailed('path is empty!')
      return;
    }
    try {
      const credentials = await getCredentials();
      const config = new AWS.Config({
        credentials,
      })
      const s3 = new AWS.S3(config)

      const allFiles = getAllFiles();

      const needUpload = [];

      // calc ETag
      function etagFile(file) {
        const etag = createHash().update(file).digest();
        return etag;
      }

      // upload single
      function uploadFile(key, body) {
        return new Promise((resolve, reject) => {
          const contentType = mime.lookup(key);

          if (!contentType) {
            reject(new Error(`${key} is not a valid mime type`));
          }

          s3.upload({
            Body: body,
            Bucket: BUCKET_NAME,
            ACL: 'public-read',
            Key: key,
            ContentType: contentType,
          }, {}, (err, data) => {
            if (err) {
              core.error(`upload ${key} failed!`, err)
              reject(err);
            } else {
              resolve(true)
            }
          })
        })
      }

      function getMeta(key) {
        return new Promise((resolve, reject) => {
          s3.headObject({ Bucket: BUCKET_NAME, Key: key }, (err, data) => {
            if (err) {
              // none
              resolve(null);
            } else {
              resolve(data)
            }
          })
        })
      }

      let uploadCount = 0;
      const mapFunction = allFiles.map(([filename, folder]) => {
        return async function () {
          let absoluteFilePath = path.join(folder, filename);
          // replace windows path to unix path
          absoluteFilePath = absoluteFilePath.replace(/\\/g, '/');
          const fileContent = fs.readFileSync(path.resolve(BASE_DIR, absoluteFilePath));

          let needUpload = true;
          if (params.compare) {
            const meta = await getMeta(absoluteFilePath);
            const etag = etagFile(fileContent);
            const hasExistFile = meta && meta.ETag === JSON.stringify(etag);
            needUpload = !hasExistFile;
          }
          if (needUpload) {
            // upload
            needUpload.push(absoluteFilePath.startsWith('/') ? absoluteFilePath : ('/' + absoluteFilePath))
            const formattedKey = formatS3Key(absoluteFilePath); // replace windows '\\' to '/'
            await uploadFile(formattedKey, fileContent);
            uploadCount++;
          }
        }
      })

      await Promise.all(mapFunction.map(f => f()));

      core.info(`total files: ${allFiles.length}, upload changed files: ${uploadCount}`);

      function encodeUrl(str) {
        return str.replace(/[~]/ig, '%7E');
      }

      // create invalidation
      function createInv() {
        return new Promise((resolve, reject) => {
          const cf = new AWS.CloudFront({});
          cf.createInvalidation({
            DistributionId: DistributionId,
            InvalidationBatch: {
              Paths: {
                Items: needUpload.map(url => encodeUrl(url)),
                Quantity: needUpload.length,
              },
              CallerReference: Date.now().toString(),
            }
          }, (err, data) => {
            if (err) {
              reject(err);
            } else {
              core.info(data);
              resolve(data);
            }
          })
        })
      }

      if (uploadCount > 0 && params.cloudFrontDistributionId) {
        core.info('create invalidation paths', needUpload);
        try {
          await createInv();
          core.info('clear cdn cache success!');
        } catch (error) {
          core.error('create invalidation failed', error);
        }

      }
    } catch (error) {
      core.error(error);
      core.setFailed(error.message);
    }
  }

  await upload();
}

main().catch(error => {
  core.error(error);
  core.setFailed(error.message);
});
