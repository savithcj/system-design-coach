// Node side of the eval runner: reads the fixture files. The checks themselves live in check.ts so the browser page can use them.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Fixture } from './check'

export * from './check'

export function loadFixtures(dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')): Fixture[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Fixture)
}

