import { append, type Actor, type EventLog, type KnownType, type PayloadMap } from '../../src/core/events'
import { defaultLabel } from '../../src/core/actions'
import { freeSlot } from '../../src/core/layout'
import { reduce } from '../../src/core/reduce'
import type { Role } from '../../src/core/roles'

/** A tiny session driver with a fake clock, mirroring how the UI appends events. */
export class Session {
  log: EventLog = []
  now = 1_000_000
  constructor(public W = 800) { this.add('ProblemLoaded', { problemId: 'url' }) }
  get state() { return reduce(this.log) }
  add<K extends KnownType>(type: K, payload: PayloadMap[K], actor: Actor = 'user', dt = 100) {
    this.now += dt
    this.log = append(this.log, type, payload, actor, this.now)
  }
  node(role: Role, label?: string): string {
    const id = `n${this.log.length + 1}`
    const slot = freeSlot(this.state.nodes, this.W)
    this.add('NodeAdded', { id, role, label: label ?? defaultLabel(this.state, role), ...slot })
    return id
  }
  edge(a: string, b: string): string {
    const id = `e${this.log.length + 1}`
    this.add('EdgeAdded', { id, a, b })
    return id
  }
}
