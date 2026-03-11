import { Client } from 'minio';
import { config } from './config.js';

const minioClient = new Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(config.minio.bucket);
  if (!exists) {
    await minioClient.makeBucket(config.minio.bucket);
    console.log(`Created bucket: ${config.minio.bucket}`);
  }
}

function validateDocumentId(documentId: string): void {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(documentId)) {
    throw new Error(`Invalid documentId: ${documentId}`);
  }
}

export async function loadDocument(documentId: string): Promise<Buffer | null> {
  validateDocumentId(documentId);
  try {
    const key = `documents/${documentId}/current.docx`;
    const stream = await minioClient.getObject(config.minio.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (err: any) {
    if (err.code === 'NoSuchKey' || err.code === 'NotFound' || err.message?.includes('NoSuchKey')) {
      return null;
    }
    throw err;
  }
}

export async function saveDocument(documentId: string, data: Buffer): Promise<void> {
  validateDocumentId(documentId);
  const key = `documents/${documentId}/current.docx`;
  await minioClient.putObject(config.minio.bucket, key, data);
}
