import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  }
});

export const uploadFile = async (
  bucketName: string,
  key: string,
  body: Buffer | Uint8Array | Blob | string,
  contentType: string
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await s3Client.send(command);

  // Return the secure URL (assuming public read access or presigned URL requirement depending on use case)
  // For basic public access URL:
  return `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
};
