import { buildApp } from './app.js';
import { config } from './config.js';
import { closeMongo, describeMongoError, isMongoConfigured } from './db/client.js';
import { ensureRegularIndexes } from './db/indexes.js';

const app = await buildApp();

if (isMongoConfigured()) {
  ensureRegularIndexes()
    .then((r) => app.log.info({ collections: r.length }, 'Regular indexes ensured'))
    .catch((err: unknown) => app.log.warn(describeMongoError(err)));
} else {
  app.log.warn('MONGODB_URI is not set: /api/ready will report not_ready until it is added to .env');
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'Shutting down');
  try {
    await app.close();
    await closeMongo();
  } finally {
    process.exit(0);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.PORT, host: config.HOST });
