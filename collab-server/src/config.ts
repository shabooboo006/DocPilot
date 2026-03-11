import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.COLLAB_SERVER_PORT || '3050', 10),
  minio: {
    endPoint: (process.env.MINIO_ENDPOINT || 'localhost:9000').split(':')[0],
    port: parseInt((process.env.MINIO_ENDPOINT || 'localhost:9000').split(':')[1] || '9000', 10),
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'docpilot-documents',
    useSSL: process.env.MINIO_USE_SSL === 'true',
  },
};
