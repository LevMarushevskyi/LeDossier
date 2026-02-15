import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

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

export async function getFromS3(key: string): Promise<string | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.DOSSIER_BUCKET!,
        Key: key,
      })
    );
    return (await result.Body?.transformToString()) ?? null;
  } catch (err: any) {
    if (err.name === "NoSuchKey") return null;
    throw err;
  }
}
