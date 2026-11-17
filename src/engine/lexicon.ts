/**
 * Technology names a reply must not introduce unless the learner already did. Each group is one thing under
 * several names. This is a closed, explicit list for the grounding gate only; nothing else reads it.
 */
export const TECH_GROUPS: readonly (readonly string[])[] = [
  ['redis', 'valkey'], ['memcached', 'memcache'], ['postgres', 'postgresql', 'psql'], ['mysql', 'mariadb'], ['mongodb', 'mongo'],
  ['dynamodb', 'dynamo'], ['cassandra', 'scylla'], ['kafka'], ['rabbitmq', 'rabbit'], ['sqs'], ['sns'], ['pulsar'],
  ['elasticsearch', 'opensearch', 'elastic'], ['solr', 'lucene'], ['typesense'], ['algolia'], ['meilisearch'],
  ['s3', 'object storage'], ['cloudfront', 'cdn'], ['nginx'], ['haproxy'], ['envoy'], ['zookeeper'], ['etcd'], ['consul'],
  ['debezium', 'cdc', 'change data capture'], ['websocket', 'websockets'], ['sse', 'server-sent events', 'server sent events'],
  ['graphql'], ['grpc'], ['lambda'], ['sqlite'], ['oracle'], ['cockroachdb', 'cockroach'], ['vitess'], ['hbase'], ['bigtable'],
  ['spanner'], ['flink'], ['spark'], ['bloom filter'], ['consistent hashing'], ['token bucket'], ['leaky bucket'],
]
