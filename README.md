# AWS S3 Sync Action

Sync files to s3 with compare and create cloudfront invalidation.

## Inputs

## `AWS_ACCESS_KEY_ID`

**Required** AWS_ACCESS_KEY_ID.

## `AWS_SECRET_ACCESS_KEY`

**Required** AWS_SECRET_ACCESS_KEY.

## `AWS_REGION`

**Required** AWS_REGION.

## `AWS_BUCKET_NAME`

**Required** AWS_BUCKET_NAME.

## `AWS_CLOUDFRONT_DISTRIBUTION_ID`

DISTRIBUTION_ID, if set, will create cloudfront invalidation, need permissions.

## `compare`

Compare source files with s3, upload if is different or not exist.

## `source`

**Required** Source dir.

## Example usage

``` yml
uses: wxul/aws-s3-sync-action@master
with:
  AWS_ACCESS_KEY_ID: ''
  AWS_SECRET_ACCESS_KEY: ''
  AWS_REGION: ''
  AWS_BUCKET_NAME: ''
  AWS_CLOUDFRONT_DISTRIBUTION_ID: ''
  source: './dist'
```
