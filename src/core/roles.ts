// The seven fixed categories. The learner's chosen NAME carries the technology; the category never changes.
export type Role = 'client' | 'service' | 'cache' | 'db' | 'blob' | 'queue' | 'other'

export const ROLE_ORDER: readonly Role[] = ['client', 'service', 'cache', 'db', 'blob', 'queue', 'other']

export const ROLES: Readonly<Record<Role, { label: string; hint: string }>> = {
  client: { label: 'Client', hint: 'e.g. Web app' },
  service: { label: 'Server', hint: 'e.g. API server, load balancer, worker' },
  cache: { label: 'Cache', hint: 'e.g. Redis' },
  db: { label: 'Database', hint: 'e.g. Postgres' },
  blob: { label: 'Storage', hint: 'e.g. S3, files' },
  queue: { label: 'Queue', hint: 'e.g. Kafka' },
  other: { label: 'Other', hint: 'Anything else' },
}

export function roleLabel(role: string): string {
  return (ROLES as Record<string, { label: string }>)[role]?.label ?? ROLES.service.label
}
