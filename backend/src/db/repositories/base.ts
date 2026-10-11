import {
  ObjectId,
  type ClientSession,
  type Collection,
  type Document,
  type Filter,
  type FindOptions,
  type OptionalUnlessRequiredId,
  type UpdateFilter,
} from 'mongodb';
import type { BaseDoc } from '../collections.js';
import { AppError } from '../../lib/errors.js';

export type NewDoc<T extends BaseDoc> = Omit<T, '_id' | 'orgId' | 'createdAt' | 'updatedAt' | 'isSeed'> & {
  isSeed?: boolean;
  createdAt?: Date;
};

/** Every scoped call must receive a real ObjectId; this guards against `undefined` slipping through. */
export function assertOrgId(orgId: ObjectId): ObjectId {
  if (!(orgId instanceof ObjectId)) {
    throw new AppError(500, 'ORG_SCOPE_MISSING', 'Repository call without an orgId');
  }
  return orgId;
}

export function toObjectId(id: string | ObjectId, what = 'Resource'): ObjectId {
  if (id instanceof ObjectId) return id;
  if (!ObjectId.isValid(id) || id.length !== 24) throw new AppError(404, 'NOT_FOUND', `${what} not found`);
  return new ObjectId(id);
}

/**
 * Base repository: every read and write includes `orgId` in its filter, so a
 * document from another tenant can never be read, changed or deleted.
 */
export class ScopedRepository<T extends BaseDoc> {
  constructor(protected readonly collection: () => Promise<Collection<T>>) {}

  protected scope(orgId: ObjectId, filter: Filter<T> = {}): Filter<T> {
    return { ...filter, orgId: assertOrgId(orgId) } as Filter<T>;
  }

  async find(orgId: ObjectId, filter: Filter<T> = {}, options: FindOptions = {}): Promise<T[]> {
    const c = await this.collection();
    return (await c.find(this.scope(orgId, filter), options).toArray()) as T[];
  }

  async findById(orgId: ObjectId, id: string | ObjectId): Promise<T | null> {
    const c = await this.collection();
    return (await c.findOne(this.scope(orgId, { _id: toObjectId(id) } as Filter<T>))) as T | null;
  }

  async findByIds(orgId: ObjectId, ids: (string | ObjectId)[]): Promise<T[]> {
    if (ids.length === 0) return [];
    const c = await this.collection();
    const oids = ids.map((id) => toObjectId(id));
    return (await c.find(this.scope(orgId, { _id: { $in: oids } } as Filter<T>)).toArray()) as T[];
  }

  async count(orgId: ObjectId, filter: Filter<T> = {}): Promise<number> {
    const c = await this.collection();
    return c.countDocuments(this.scope(orgId, filter));
  }

  async insertOne(orgId: ObjectId, doc: NewDoc<T>, session?: ClientSession): Promise<T> {
    const c = await this.collection();
    const now = new Date();
    const full = {
      ...doc,
      _id: new ObjectId(),
      orgId: assertOrgId(orgId),
      isSeed: doc.isSeed ?? false,
      createdAt: doc.createdAt ?? now,
      updatedAt: now,
    } as unknown as T;
    await c.insertOne(full as OptionalUnlessRequiredId<T>, { session });
    return full;
  }

  async insertMany(orgId: ObjectId, docs: NewDoc<T>[]): Promise<T[]> {
    if (docs.length === 0) return [];
    const c = await this.collection();
    const now = new Date();
    const full = docs.map(
      (doc) =>
        ({
          ...doc,
          _id: new ObjectId(),
          orgId: assertOrgId(orgId),
          isSeed: doc.isSeed ?? false,
          createdAt: doc.createdAt ?? now,
          updatedAt: now,
        }) as unknown as T,
    );
    await c.insertMany(full as OptionalUnlessRequiredId<T>[]);
    return full;
  }

  async updateById(
    orgId: ObjectId,
    id: string | ObjectId,
    update: UpdateFilter<T>,
    session?: ClientSession,
  ): Promise<T | null> {
    const c = await this.collection();
    const withTimestamp = { ...update, $set: { ...(update.$set ?? {}), updatedAt: new Date() } } as UpdateFilter<T>;
    return (await c.findOneAndUpdate(this.scope(orgId, { _id: toObjectId(id) } as Filter<T>), withTimestamp, {
      returnDocument: 'after',
      session,
    })) as T | null;
  }

  async updateMany(orgId: ObjectId, filter: Filter<T>, update: UpdateFilter<T>, session?: ClientSession) {
    const c = await this.collection();
    const withTimestamp = { ...update, $set: { ...(update.$set ?? {}), updatedAt: new Date() } } as UpdateFilter<T>;
    return c.updateMany(this.scope(orgId, filter), withTimestamp, { session });
  }

  /**
   * Upserts a seed record by (orgId, seedKey). Seed fields are reset to their
   * seeded values; `preserve` lists fields left untouched on existing docs.
   */
  async upsertSeed(orgId: ObjectId, seedKey: string, doc: NewDoc<T>, preserve: string[] = []): Promise<T> {
    const c = await this.collection();
    const now = new Date();
    const { createdAt, ...rest } = doc as NewDoc<T> & { createdAt?: Date };
    const $set: Record<string, unknown> = { ...rest, isSeed: true, seedKey, updatedAt: now };
    const $setOnInsert: Record<string, unknown> = { _id: new ObjectId(), orgId: assertOrgId(orgId), createdAt: createdAt ?? now };
    for (const f of preserve) {
      if (f in $set) $setOnInsert[f] = $set[f];
      delete $set[f];
    }
    const res = await c.findOneAndUpdate(
      this.scope(orgId, { seedKey } as Filter<T>),
      { $set, $setOnInsert } as unknown as UpdateFilter<T>,
      { upsert: true, returnDocument: 'after' },
    );
    return res as T;
  }

  /** Aggregation whose first stage is always the tenant $match. */
  async aggregate<R extends Document = Document>(orgId: ObjectId, pipeline: Document[]): Promise<R[]> {
    const c = await this.collection();
    return c.aggregate<R>([{ $match: { orgId: assertOrgId(orgId) } }, ...pipeline]).toArray();
  }

  /** Deletes only within the org; callers are restricted to the test org and non-seed demo data. */
  async deleteMany(orgId: ObjectId, filter: Filter<T>): Promise<number> {
    const c = await this.collection();
    const res = await c.deleteMany(this.scope(orgId, filter));
    return res.deletedCount;
  }
}
