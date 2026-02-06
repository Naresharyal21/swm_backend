const { S3Client } = require('@aws-sdk/client-s3');
const env = require('./env');

let s3;

function getS3Client() {
  if (!s3) {
    s3 = new S3Client({
      region: env.s3.region,
      endpoint: env.s3.endpoint,
      credentials: {
        accessKeyId: env.s3.accessKey,
        secretAccessKey: env.s3.secretKey
      },
      forcePathStyle: env.s3.forcePathStyle
    });
  }
  return s3;
}

module.exports = { getS3Client };
