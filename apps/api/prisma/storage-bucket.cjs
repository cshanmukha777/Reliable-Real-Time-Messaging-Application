const { CreateBucketCommand, S3Client } = require('@aws-sdk/client-s3');

async function main() {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION = 'us-east-1' } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new Error('Incomplete storage settings');
  if (new URL(S3_ENDPOINT).hostname !== '127.0.0.1') throw new Error('This command only provisions local development storage');
  const s3 = new S3Client({
    endpoint: S3_ENDPOINT, region: S3_REGION, forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });
  try {
    await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
  } catch (error) {
    if (error.name !== 'BucketAlreadyOwnedByYou') throw error;
  } finally {
    s3.destroy();
  }
}
main().catch(() => {
  console.error('Could not create the private local attachment bucket.');
  process.exitCode = 1;
});
