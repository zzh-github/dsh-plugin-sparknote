/** Host persistence and owner-only annotation RPC for the Reading Collection bundle. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { commandSchema, recordSchema } from './schema.ts'
import { ReadingRepository, ReadingError } from './repository.ts'
import { z } from 'zod'

export const inject = ['storageDomain', 'connection']
const domainSpec = defineDomain({ name: 'reading_collection', version: 1, tables: { messages: domainTable<string, import('./schema.ts').ReadingRecord>(recordSchema) } })

/** @param ctx Host services; unloading first stops admission, then drains writes, then closes storage. */
export async function apply(ctx: Context): Promise<void> {
  await ctx.effect(async () => {
    const domain = await ctx.storageDomain.open(domainSpec)
    const repository = new ReadingRepository(domain.table('messages'))
    let closing = false
    let unregister: () => Promise<void>
    try {
      unregister = ctx.connection.fetch.register({
        path: '/api/reading-collection', methods: ['POST'], requestBody: 'buffered',
        fetch: async request => {
          try {
            const envelope = z.object({ operation: z.enum(['list', 'mutate']), payload: z.unknown() }).parse(await request.json())
            if (closing) return Response.json({ ok: false, error: { code: 'closing', message: 'Plugin is unloading', details: {} } }, { status: 503 })
            const value = envelope.operation === 'list' ? await repository.list() : await repository.mutate(commandSchema.parse(envelope.payload))
            return Response.json({ ok: true, value })
          } catch (error) {
            ctx.logger.warn('Reading Collection request failed', error)
            return Response.json({ ok: false, error: { code: error instanceof ReadingError ? error.code : error instanceof z.ZodError ? 'invalid-request' : 'storage-failed', message: 'Unable to save annotations', details: {} } })
          }
        },
      })
    } catch (error) {
      await domain.close()
      throw error
    }
    return async () => {
      closing = true
      await unregister()
      await repository.drain()
      await domain.close()
    }
  })
}
