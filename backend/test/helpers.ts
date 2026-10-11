import type { ObjectId } from 'mongodb';
import { isMongoConfigured, pingMongo } from '../src/db/client.js';
import { ensureRegularIndexes } from '../src/db/indexes.js';
import {
  agentsRepo,
  checkpointsRepo,
  eventsRepo,
  identityRepo,
  memoriesRepo,
  outcomesRepo,
  retrievalLogsRepo,
  stepExecutionsRepo,
  tasksRepo,
  TEST_ORG_SLUG,
} from '../src/db/repositories/index.js';

/** Resolved once per file: whether integration tests can run, and why not. */
export async function atlasAvailability(): Promise<{ ok: boolean; reason: string }> {
  if (!isMongoConfigured()) return { ok: false, reason: 'MONGODB_URI is not set' };
  const ping = await pingMongo();
  if (!ping.ok) return { ok: false, reason: `Atlas unreachable: ${ping.detail}` };
  await ensureRegularIndexes();
  return { ok: true, reason: '' };
}

export function announceSkip(file: string, reason: string) {
  console.warn(`\n⚠ SKIPPED integration tests in ${file}: ${reason}\n`);
}

export const TEST_ORG_B_SLUG = `${TEST_ORG_SLUG}:b`;

export async function testOrgs(): Promise<{ a: ObjectId; b: ObjectId; userA: ObjectId }> {
  const { org, user } = await identityRepo.ensureTestIdentity();
  const b = await identityRepo.ensureOrg(TEST_ORG_B_SLUG, 'Integration tests (second tenant)', false);
  return { a: org._id, b: b._id, userA: user._id };
}

/** Removes every document owned by the test orgs. Never touches other orgs. */
export async function cleanTestOrgs(...orgIds: ObjectId[]) {
  for (const orgId of orgIds) {
    for (const repo of [memoriesRepo, agentsRepo, tasksRepo, checkpointsRepo, stepExecutionsRepo, outcomesRepo, retrievalLogsRepo, eventsRepo]) {
      await (repo as typeof memoriesRepo).deleteMany(orgId, {});
    }
  }
}
