import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT!,
  region: process.env.S3_REGION!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = "person-images"; // This must be the name of your bucket

/**
 * Creates a pre-signed URL for downloading a file. Used for displaying images.
 * @param key The path to the file in the bucket.
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
 * Uploads a file buffer to S3 from the server.
 * @param fileBuffer The file content as a Buffer.
 * @param fileName The original name of the file to extract the extension.
 * @param contentType The MIME type of the file (e.g., 'image/jpeg').
 * @returns An object with the final key of the uploaded file.
 */
export async function uploadFileToS3(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<{ key: string }> {
  const fileExtension = fileName.split(".").pop();
  const key = `${randomUUID()}.${fileExtension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  });

  await s3Client.send(command);
  return { key };
}

/**
 * Deletes a file from S3.
 * @param key The key of the file to delete.
 */
export async function deleteFileFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  try {
    await s3Client.send(command);
    console.log(`Successfully deleted ${key} from S3.`);
  } catch (error) {
    console.error(`Error deleting ${key} from S3:`, error);
    // Decide if you want to throw the error or just log it
  }
}