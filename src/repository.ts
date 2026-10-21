/** Ordered annotation mutations over a durable message table. */
import { recordKey, type Command, type ReadingRecord } from './schema.ts'

/** Durable table supplied by the Harness storage domain. */
export interface RecordTable {
  /** @param key Message pair identity. @returns Committed record, or absence. */
  get(key: string): ReadingRecord | undefined
  /** @returns Snapshot of committed record pairs. */
  entries(): IterableIterator<[string, ReadingRecord]>
  /** @param key Message pair identity. @param value Replacement record. @returns Completion of durable publication. */
  put(key: string, value: ReadingRecord): Promise<void>
}

/** Declared mutation failures; failed commands leave the committed record untouched. */
export class ReadingError extends Error {
  /** @param code Stable failure discriminator. */
  constructor(readonly code: 'record-missing' | 'invalid-anchor' | 'message-changed' | 'highlight-missing') { super(code) }
}

/** Serializes all readers and writers against committed storage state. */
export class ReadingRepository {
  private tail: Promise<unknown> = Promise.resolve()
  /** @param table Authoritative durable table. */
  constructor(private readonly table: RecordTable) {}

  /** @returns Committed records after all earlier mutations settle. */
  async list(): Promise<ReadingRecord[]> {
    await this.tail
    return Array.from(this.table.entries(), ([, value]) => value)
  }

  /** @param command Validated change. @returns Record after durable commit; failed writes preserve the previous value. */
  mutate(command: Command): Promise<ReadingRecord> {
    const pending = this.tail.then(async () => {
      const key = 'source' in command ? recordKey(command.source) : command.key
      const previous = this.table.get(key)
      const now = Date.now()
      let record: ReadingRecord
      if (previous !== undefined) record = { ...previous, highlights: [...previous.highlights] }
      else if ('source' in command) record = { ...command.source, titleEdited: false, highlights: [], savedAt: null, updatedAt: now, revision: 0 }
      else throw new ReadingError('record-missing')
      switch (command.kind) {
        case 'highlight': {
          const { anchor } = command.highlight
          if (command.source.plainText.slice(anchor.start, anchor.end) !== anchor.quote) throw new ReadingError('invalid-anchor')
          if (record.markdown !== command.source.markdown) throw new ReadingError('message-changed')
          if (!record.highlights.some(item => item.id === command.highlight.id)) record.highlights.push(command.highlight)
          break
        }
        case 'recolor':
          if (!record.highlights.some(item => item.id === command.id)) throw new ReadingError('highlight-missing')
          record.highlights = record.highlights.map(item => item.id === command.id ? { ...item, color: command.color } : item)
          break
        case 'remove-highlight': record.highlights = record.highlights.filter(item => item.id !== command.id); break
        case 'collect':
          if (command.saved) {
            if (record.markdown !== command.source.markdown) throw new ReadingError('message-changed')
            if (record.savedAt === null && record.titleEdited !== true) record.title = command.source.title
            if (command.source.question !== undefined) record.question = command.source.question
            record.savedAt ??= now
          } else {
            // Legacy records have no title ownership flag; keep their titles on recollection.
            record.titleEdited ??= true
            record.savedAt = null
          }
          break
        case 'rename': record.title = command.title; record.titleEdited = true; break
        default: assertNever(command)
      }
      record.revision += 1
      record.updatedAt = now
      await this.table.put(key, record)
      return record
    })
    this.tail = pending.then(() => undefined, () => undefined)
    return pending
  }

  /** @returns Completion of accepted writes, including failures already reported to callers. */
  async drain(): Promise<void> { await this.tail }
}

function assertNever(value: never): never { throw new Error(`Unknown reading operation: ${String(value)}`) }
