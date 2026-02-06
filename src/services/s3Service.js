const crypto = require('crypto');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const env = require('../config/env');
const { getS3Client } = require('../config/s3');

function makeKey(prefix, originalName) {
  const safeName = (originalName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const rand = crypto.randomBytes(12).toString('hex');
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}/${date}/${rand}_${safeName}`;
}

async function uploadBuffer({ buffer, contentType, originalName, prefix = 'evidence' }) {
  const key = makeKey(prefix, originalName);
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream'
    })
  );
  return { bucket: env.s3.bucket, key };
}

async function getDownloadUrl({ key, expiresInSeconds = 3600 }) {
  const s3 = getS3Client();
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }),
    { expiresIn: expiresInSeconds }
  );
  return url;
}

module.exports = { uploadBuffer, getDownloadUrl };
