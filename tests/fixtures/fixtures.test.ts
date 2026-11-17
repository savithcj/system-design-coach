import { describe, expect, it } from 'vitest'
import { parseLog, serializeLog } from '../../src/core/events'
import { scriptedText } from '../../src/engine/script'
import { fakeModel } from '../../src/model/fake'
import { loadFixtures, runFixture, runFixtureWithModel, summarizeModel, type Fixture } from '../../evals/harness'

const fixtures = loadFixtures()

describe('fixtures (layers A, B and C with the scripted coach)', () => {
  it('there are 10 to 25 of them, with unique ids', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10)
    expect(fixtures.length).toBeLessThanOrEqual(25)
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length)
  })

  it.each(fixtures.map((f) => [f.id, f] as const))('%s', (_id, f) => {
    const r = runFixture(f)
    expect([...r.a, ...r.b, ...r.c]).toEqual([])
  })

  it('every log is a clean app log: contiguous seq and it survives copy and reload', () => {
    for (const f of fixtures) {
      expect(f.events.map((e) => e.seq), f.id).toEqual(f.events.map((_, i) => i + 1))
      expect(parseLog(serializeLog(f.events)), f.id).toEqual(f.events)
    }
  })

  it('valid-alternative fixtures exist and expect no flags', () => {
    const alts = fixtures.filter((f) => f.id.includes('valid_alternative'))
    expect(alts.length).toBeGreaterThanOrEqual(3)
    for (const f of alts) expect(f.expect.flags, f.id).toEqual([])
  })

  it('each starter rule is flagged by at least one fixture', () => {
    const seen = new Set(fixtures.flatMap((f) => f.expect.flags))
    const missing = ['REQ_TOO_MANY_FEATURES', 'REQ_NO_OUT_OF_SCOPE', 'REQ_VAGUE_NFR', 'REQ_CAP_UNSCOPED', 'ENT_PREMATURE_DETAIL', 'API_NO_COVERAGE', 'API_USER_ID_IN_BODY',
      'API_SINGLE_STEP_BOOKING', 'HLD_CLIENT_TO_DB', 'HLD_NO_ENTRY_POINT', 'HLD_UNFINISHED_PATH', 'HLD_PREMATURE_OPTIMISATION',
      'DD_RESERVATION_NO_EXPIRY', 'DD_CRON_STALE_WINDOW', 'DD_SEARCH_FULL_SCAN', 'DD_SEARCH_PRIMARY_STORE', 'DD_SURGE_NO_CHOKEPOINT', 'DD_LOCK_STORE_OUTAGE']
      .filter((id) => !seen.has(id))
    expect(missing).toEqual([])
  })
})

describe('the harness catches real failures', () => {
  const base = fixtures.find((f) => f.id === 'tm_client_to_db')!
  const with_ = (expect_: Partial<Fixture['expect']>): Fixture => ({ ...base, expect: { ...base.expect, ...expect_ } })

  it('layer A: wrong flag set, forbidden flag present, wrong stage', () => {
    expect(runFixture(with_({ flags: ['HLD_CLIENT_TO_DB'] })).a).toHaveLength(1)
    expect(runFixture(with_({ notFlags: ['HLD_CLIENT_TO_DB'] })).a).toHaveLength(1)
    expect(runFixture({ ...base, stage: 2 }).a).toHaveLength(1)
  })
  it('layer B: wrong move, disallowed move, wrong rule', () => {
    expect(runFixture(with_({ move: 'scale_curveball' })).b).toHaveLength(1)
    expect(runFixture(with_({ moveNot: ['challenge_assumption'] })).b).toHaveLength(1)
    expect(runFixture(with_({ moveAbout: ['HLD_UNFINISHED_PATH'] })).b).toHaveLength(1)
  })
  it('layer C: a phraser that spoils, names a ghost, or says a forbidden term is counted', () => {
    const leaky = runFixture(with_({ forbiddenInReply: ['kafka'] }), () => 'Would a waiting queue and Kafka help?')
    expect(leaky.spoilerLeaks).toBeGreaterThan(0) // "waiting queue" is held back until stage 5
    expect(leaky.ghosts).toBeGreaterThan(0)
    expect(leaky.c.some((x) => x.includes('forbidden "kafka"'))).toBe(true)
    expect(runFixture(base, scriptedText).c).toEqual([])
  })
})

describe('layer C with a model: the numbers measure the model, and the gate keeps what is shown clean', () => {
  const run = async (mode: Parameters<typeof fakeModel>[0], timeoutMs = 50) => {
    const m = fakeModel(mode); await m.load(() => {})
    return summarizeModel(await Promise.all(fixtures.map((f) => runFixtureWithModel(f, m, timeoutMs))))
  }
  it('a model that only rewords the seed scores 0% everywhere', async () => {
    expect(await run('good')).toMatchObject({ rawSpoilerRate: 0, rawGhostRate: 0, rawOtherRate: 0, rawErrorRate: 0, shownBadRate: 0, fallbackRate: 0 })
  })
  it('a model that invents components is counted raw, but learners never see it', async () => {
    const s = await run('ghost')
    expect(s.rawGhostRate).toBe(100)
    expect(s.shownBadRate).toBe(0)
    expect(s.fallbackRate).toBe(100)
  })
  it('a model that leaks held-back terms is counted raw, and never shown', async () => {
    const s = await run('spoiler')
    expect(s.rawSpoilerRate).toBeGreaterThan(0)
    expect(s.shownBadRate).toBe(0)
  })
  it('a model that hangs or returns garbage is an error rate, and the scripted line is shown', async () => {
    for (const mode of ['hang', 'garbage'] as const) {
      const s = await run(mode)
      expect(s.rawErrorRate, mode).toBe(100)
      expect(s.shownBadRate, mode).toBe(0)
    }
  })
})
