import type { Document } from 'mongodb';
import { config } from '../config.js';
import { rawCollections } from './collections.js';

export const SEARCH_INDEX_NAME = 'memories_search';
export const VECTOR_INDEX_NAME = 'memories_vector';

export interface SearchIndexInfo {
  name: string;
  type: string;
  status: string;
  queryable: boolean;
  latestDefinition?: Document;
}

/** Lists Atlas Search indexes on `memories`. Returns [] when the collection does not exist yet. */
export async function listMemorySearchIndexes(): Promise<SearchIndexInfo[]> {
  const { memories } = await rawCollections();
  try {
    const raw = (await memories.listSearchIndexes().toArray()) as Document[];
    return raw.map((i) => ({
      name: String(i.name),
      type: String(i.type ?? 'search'),
      status: String(i.status ?? 'UNKNOWN'),
      queryable: i.queryable === true,
      latestDefinition: i.latestDefinition as Document | undefined,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ns does not exist|NamespaceNotFound|does not exist/i.test(msg)) return [];
    throw err;
  }
}

export function searchIndexDefinition(): Document {
  return {
    mappings: {
      dynamic: false,
      fields: {
        title: { type: 'string', analyzer: 'lucene.english', multi: { exact: { type: 'string', analyzer: 'lucene.whitespace' } } },
        content: { type: 'string', analyzer: 'lucene.english', multi: { exact: { type: 'string', analyzer: 'lucene.whitespace' } } },
        tags: [{ type: 'string' }, { type: 'token' }],
        type: { type: 'token' },
        orgId: { type: 'objectId' },
        agentId: { type: 'objectId' },
        archived: { type: 'boolean' },
        verification: { type: 'document', fields: { status: { type: 'token' } } },
        createdAt: { type: 'date' },
      },
    },
  };
}

export function vectorIndexDefinition(dimensions = config.VOYAGE_DIMENSIONS): Document {
  return {
    fields: [
      { type: 'vector', path: 'embedding.vector', numDimensions: dimensions, similarity: 'cosine' },
      { type: 'filter', path: 'orgId' },
      { type: 'filter', path: 'agentId' },
      { type: 'filter', path: 'type' },
      { type: 'filter', path: 'archived' },
      { type: 'filter', path: 'verification.status' },
    ],
  };
}

/** numDimensions configured on the live vector index, if present. */
export function vectorIndexDimensions(info: SearchIndexInfo | undefined): number | null {
  const fields = (info?.latestDefinition?.fields ?? []) as { type?: string; numDimensions?: number }[];
  const v = fields.find((f) => f.type === 'vector');
  return v?.numDimensions ?? null;
}
