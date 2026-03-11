import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { CollaborationBuilder, type CollaborationParams } from '@superdoc-dev/superdoc-yjs-collaboration';
import { encodeStateAsUpdate } from 'yjs';
import { config } from './config.js';
import { ensureBucket, loadDocument, saveDocument } from './storage.js';

const fastify = Fastify({ logger: true });

await fastify.register(websocketPlugin);

const collaboration = new CollaborationBuilder()
  .withName('DocPilot Collaboration')
  .withDebounce(2000)
  .onLoad(async ({ documentId }: CollaborationParams) => {
    const buffer = await loadDocument(documentId);
    if (!buffer) return null;
    return new Uint8Array(buffer);
  })
  .onAutoSave(async ({ documentId, document }: CollaborationParams) => {
    if (!document) return;
    const state = encodeStateAsUpdate(document);
    await saveDocument(documentId, Buffer.from(state));
    fastify.log.info(`Auto-saved document ${documentId}`);
  })
  .build();

fastify.register(async (app) => {
  app.get(
    '/doc/:documentId',
    { websocket: true },
    (socket, request) => {
      collaboration.welcome(socket as any, request as any);
    },
  );
});

fastify.get('/health', async () => ({ status: 'ok' }));

async function start() {
  try {
    await ensureBucket();
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
