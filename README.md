# AWS S3 Sync Action

Sync files to s3 with compare and create cloudfront invalidation.

## Inputs

## Example usage

``` yml
uses: wxul/aws-s3-sync-action@v1
env:
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}  ## AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }} ## AWS_ACCESS_KEY_ID
  AWS_REGION: us-east-1  ## AWS_REGION
with:
  aws_bucket_name: '' ## required, s3 bucket
  aws_cloudfront_distribution_id: '' ## if set, will create distribution, need permission.
  source: './dist'  ## required
  compare: true  ## default: true, only upload different files
  concurrent: 10  ## default: 20
  if_has_failed: fail  ## default: ignore, set fail to exit action if some files upload fail
```
