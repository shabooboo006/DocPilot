import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { CollaborationBuilder, type CollaborationParams } from '@superdoc-dev/superdoc-yjs-collaboration';
import { encodeStateAsUpdate } from 'yjs';
import { config } from './config.js';
import { dispatchAgentTool, getAgentTools, type DocumentMode } from './executor.js';
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
    if (!document) {
      fastify.log.warn(`onAutoSave called without document for ${documentId}, skipping`);
      return;
    }
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

fastify.get('/agent/tools', async (request, reply) => {
  const query = request.query as { mode?: string };
  const mode = normalizeMode(query.mode);
  if (!mode) {
    return reply.code(400).send({ error: 'Invalid mode' });
  }

  return {
    mode,
    tools: await getAgentTools(),
  };
});

fastify.post('/agent/dispatch', async (request, reply) => {
  const body = request.body as {
    documentId?: string;
    mode?: string;
    toolCall?: {
      id?: string;
      type?: string;
      function?: {
        name?: string;
        arguments?: string;
      };
    };
  };

  if (!body.documentId || !body.toolCall?.function?.name) {
    return reply.code(400).send({ error: 'documentId and toolCall.function.name are required' });
  }

  const mode = normalizeMode(body.mode);
  if (!mode) {
    return reply.code(400).send({ error: 'Invalid mode' });
  }

  try {
    const result = await dispatchAgentTool({
      documentId: body.documentId,
      mode,
      toolCall: {
        id: body.toolCall.id,
        type: body.toolCall.type,
        function: {
          name: body.toolCall.function.name,
          arguments: body.toolCall.function.arguments ?? '{}',
        },
      },
    });

    return {
      ...result,
      mode,
      tool: body.toolCall.function.name,
    };
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({
      error: error instanceof Error ? error.message : 'Executor dispatch failed',
    });
  }
});

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

function normalizeMode(mode: string | undefined): DocumentMode | null {
  if (mode === 'editing' || mode === 'suggesting') {
    return mode;
  }

  return null;
}
