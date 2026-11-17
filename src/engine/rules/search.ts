import { allText } from '../board'
import { has } from '../text'
import type { State } from '../../core/state'

/** A box or note that says an index (not the main database) answers searches. */
export const INDEXED = ['elasticsearch', 'opensearch', 'solr', 'lucene', 'typesense', 'algolia', 'meilisearch', 'search index', 'search engine', 'inverted index']
export const hasSearchIndex = (s: State): boolean => has(allText(s), INDEXED)
export const isIndexNode = (text: string): boolean => has(text, INDEXED)
