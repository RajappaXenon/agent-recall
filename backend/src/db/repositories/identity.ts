import { ObjectId } from 'mongodb';
import { rawCollections, type OrganizationDoc, type UserDoc } from '../collections.js';

export const DEMO_ORG_SLUG = 'demo';
export const DEMO_ORG_NAME = 'Demo org';
export const DEMO_USER_EMAIL = 'demo@agentrecall.dev';
export const TEST_ORG_SLUG = '__test__';

/**
 * Organizations are the tenant root, so they are looked up by id or slug
 * rather than scoped by orgId. Users are scoped by orgId.
 */
export const identityRepo = {
  async findOrgById(orgId: ObjectId): Promise<OrganizationDoc | null> {
    const { organizations } = await rawCollections();
    return organizations.findOne({ _id: orgId });
  },

  async findOrgBySlug(slug: string): Promise<OrganizationDoc | null> {
    const { organizations } = await rawCollections();
    return organizations.findOne({ slug });
  },

  async findUser(orgId: ObjectId, userId: ObjectId): Promise<UserDoc | null> {
    const { users } = await rawCollections();
    return users.findOne({ _id: userId, orgId });
  },

  /** Upserts an org by slug. Seed orgs are marked isSeed. */
  async ensureOrg(slug: string, name: string, isSeed: boolean): Promise<OrganizationDoc> {
    const { organizations } = await rawCollections();
    const now = new Date();
    const res = await organizations.findOneAndUpdate(
      { slug },
      { $setOnInsert: { _id: new ObjectId(), slug, name, isSeed, createdAt: now, updatedAt: now } },
      { upsert: true, returnDocument: 'after' },
    );
    if (!res) throw new Error(`Failed to ensure org ${slug}`);
    return res;
  },

  async ensureUser(orgId: ObjectId, email: string, name: string, isSeed: boolean): Promise<UserDoc> {
    const { users } = await rawCollections();
    const now = new Date();
    const res = await users.findOneAndUpdate(
      { orgId, email },
      { $setOnInsert: { _id: new ObjectId(), orgId, email, name, isSeed, createdAt: now, updatedAt: now } },
      { upsert: true, returnDocument: 'after' },
    );
    if (!res) throw new Error(`Failed to ensure user ${email}`);
    return res;
  },

  /** The demo identity (org + user) used by AUTH_MODE=demo. Created on first login or by `seed`. */
  async ensureDemoIdentity(): Promise<{ org: OrganizationDoc; user: UserDoc }> {
    const org = await this.ensureOrg(DEMO_ORG_SLUG, DEMO_ORG_NAME, true);
    const user = await this.ensureUser(org._id, DEMO_USER_EMAIL, 'Demo user', true);
    return { org, user };
  },

  /** The isolated tenant used by integration tests. */
  async ensureTestIdentity(): Promise<{ org: OrganizationDoc; user: UserDoc }> {
    const org = await this.ensureOrg(TEST_ORG_SLUG, 'Integration tests', false);
    const user = await this.ensureUser(org._id, 'test@agentrecall.dev', 'Test user', false);
    return { org, user };
  },
};
