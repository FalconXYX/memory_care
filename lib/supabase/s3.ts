import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT!,
  region: process.env.S3_REGION!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = "person-images"; // This must be the name of your bucket in Supabase

/**
 * Creates a pre-signed URL for downloading a file using the AWS SDK.
 * @param key The path to the file in the bucket (e.g., 'person-id.jpg').
 * @param expiresIn The duration in seconds the URL is valid for.
 * @returns A temporary URL to access the file.
 */
export async function getS3PresignedUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return signedUrl;
}

/**
 * Creates a pre-signed URL for uploading a file using the AWS SDK.
 * @param personId The ID of the person to associate the image with.
 * @param fileExtension The extension of the file (e.g., 'jpg', 'png').
 * @returns An object with the upload URL and the final key of the file.
 */
export async function getS3UploadPresignedUrl(
  personId: string,
  fileExtension: string
): Promise<{ url: string; key: string }> {
  const key = `${personId}.${fileExtension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 }); // Shorter expiry for uploads
  return { url: signedUrl, key };
}