/** Client mirror of committed Host data; mutations preserve unrelated concurrent edits. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { recordSchema, recordKey, type Command, type ReadingRecord } from '../schema.ts'
import type { CopyKey } from './locales.ts'

export interface LibraryState {
  records: readonly ReadingRecord[]
  status: 'loading' | 'ready' | 'error'
  pending: number
  notice: { id: number; key: CopyKey; failed: boolean } | null
}

/** Instance-owned mirror of durable records with serialized commands and stale-read suppression. */
export class LibraryModel {
  readonly state = createSnapshotStore<LibraryState>({ records: [], status: 'loading', pending: 0, notice: null })
  private generation = 0
  private noticeId = 0
  private disposed = false
  private tail: Promise<unknown> = Promise.resolve()
  private retry: (() => Promise<unknown>) | undefined
  private readonly abort = new AbortController()
  /** @param rpc Validated request adapter, cancelled on unload. */
  constructor(private readonly rpc: Pick<ClientConnectionRpc, 'call'>) {}

  /** @returns Completion of a validated baseline refresh. */
  async load(): Promise<void> {
    await this.tail
    if (this.disposed) return
    const generation = ++this.generation
    try {
      const result = await this.rpc.call('/reading-collection', 'list', {}, this.abort.signal)
      if (!result.ok) throw new Error(result.error.message)
      const records = recordSchema.array().parse(result.value)
      if (!this.disposed && generation === this.generation) this.state.update(state => { state.records = records; state.status = 'ready' })
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        console.error('Reading Collection load failed', error)
        this.state.update(state => { state.status = 'error' })
      }
    }
  }

  /** @param command User change. @param notice Localized outcome key. @returns Whether the Host durably committed it. */
  change(command: Command, notice: CopyKey): Promise<boolean> {
    this.generation += 1
    this.state.update(state => { state.pending += 1 })
    const pending = this.tail.then(async () => {
      try {
        const result = await this.rpc.call('/reading-collection', 'mutate', command, this.abort.signal)
        if (!result.ok) throw new Error(result.error.message)
        const record = recordSchema.parse(result.value)
        if (this.disposed) return false
        this.state.update(state => {
          const key = recordKey(record)
          const current = state.records.findIndex(item => recordKey(item) === key)
          const records = [...state.records]
          if (current === -1) records.push(record)
          else if ((records[current]?.revision ?? -1) <= record.revision) records[current] = record
          state.records = records
          state.notice = { id: ++this.noticeId, key: notice, failed: false }
        })
        this.retry = undefined
        return true
      } catch (error) {
        if (!this.disposed) {
          console.error('Reading Collection save failed', error)
          this.retry = () => this.change(command, notice)
          this.state.update(state => { state.notice = { id: ++this.noticeId, key: 'saveError', failed: true } })
        }
        return false
      } finally {
        if (!this.disposed) this.state.update(state => { state.pending -= 1 })
      }
    })
    this.tail = pending
    return pending
  }

  /** Retry the last failed mutation without discarding visible data. */
  retryLast(): void { void this.retry?.() }
  /** Dismiss the currently displayed operation outcome. */
  dismissNotice(): void { this.state.update(state => { state.notice = null }) }
  /** @param key Localized operation failure. */
  report(key: CopyKey): void { this.state.update(state => { state.notice = { id: ++this.noticeId, key, failed: true } }) }
  /** Cancel network calls and stop publishing after plugin unload. */
  dispose(): void { this.disposed = true; this.abort.abort() }
}
