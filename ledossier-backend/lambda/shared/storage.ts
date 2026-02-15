import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});

export async function storeToS3(key: string, body: string, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.DOSSIER_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}
