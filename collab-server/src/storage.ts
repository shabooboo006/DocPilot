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
  return loadObject(`documents/${documentId}/current.docx`);
}

export async function saveDocument(documentId: string, data: Buffer): Promise<void> {
  validateDocumentId(documentId);
  const key = `documents/${documentId}/current.docx`;
  await minioClient.putObject(config.minio.bucket, key, data);
}

export async function loadChatAsset(documentId: string, assetId: string, variant: 'original' | 'preview' = 'original'): Promise<Buffer | null> {
  validateDocumentId(documentId);
  validateDocumentId(assetId);
  const meta = await loadChatAssetMeta(documentId, assetId);
  if (!meta) {
    return null;
  }

  const key = variant === 'preview' ? meta.preview_storage_key : meta.storage_key;
  return loadObject(key);
}

export async function loadChatAssetMeta(documentId: string, assetId: string): Promise<Record<string, any> | null> {
  validateDocumentId(documentId);
  validateDocumentId(assetId);
  const key = `documents/${documentId}/chat-assets/${assetId}/meta.json`;
  const raw = await loadObject(key);
  if (!raw) {
    return null;
  }

  return JSON.parse(raw.toString('utf-8'));
}

async function loadObject(key: string): Promise<Buffer | null> {
  try {
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
