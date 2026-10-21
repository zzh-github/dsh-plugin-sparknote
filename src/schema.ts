/** Version-one durable records and validated plugin RPC requests. */
import { z } from 'zod'

export const colorSchema = z.enum(['yellow', 'green', 'blue', 'pink'])
export type Color = z.infer<typeof colorSchema>
const identity = z.string().min(1).max(512)
export const sourceSchema = z.object({
  sessionId: identity.brand<'SessionId'>(), messageId: identity.brand<'MessageId'>(),
  nodeKey: z.string().min(1), seq: z.number().int().nonnegative(),
  markdown: z.string(), plainText: z.string(), title: z.string().max(300),
})
export type Source = z.infer<typeof sourceSchema>
export const anchorSchema = z.object({
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
  quote: z.string().min(1), prefix: z.string(), suffix: z.string(),
}).refine(value => value.end > value.start && value.end - value.start === value.quote.length)
export type Anchor = z.infer<typeof anchorSchema>
export const highlightSchema = z.object({ id: z.string().uuid(), color: colorSchema, anchor: anchorSchema })
export type Highlight = z.infer<typeof highlightSchema>
export const recordSchema = sourceSchema.extend({
  highlights: z.array(highlightSchema), savedAt: z.number().nullable(), updatedAt: z.number(), revision: z.number().int().nonnegative(),
})
export type ReadingRecord = z.infer<typeof recordSchema>
export const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('highlight'), source: sourceSchema, highlight: highlightSchema }),
  z.object({ kind: z.literal('recolor'), key: z.string(), id: z.string().uuid(), color: colorSchema }),
  z.object({ kind: z.literal('remove-highlight'), key: z.string(), id: z.string().uuid() }),
  z.object({ kind: z.literal('collect'), source: sourceSchema, saved: z.boolean() }),
  z.object({ kind: z.literal('rename'), key: z.string(), title: z.string().trim().min(1).max(300) }),
])
export type Command = z.infer<typeof commandSchema>

/** @param source Message identities. @returns Collision-free record key. */
export function recordKey(source: Pick<Source, 'sessionId' | 'messageId'>): string {
  return JSON.stringify([source.sessionId, source.messageId])
}

/** @param text Rendered message text. @param start Selection start. @param end Selection end. @returns Persistent quote and context. */
export function makeAnchor(text: string, start: number, end: number): Anchor {
  return anchorSchema.parse({ start, end, quote: text.slice(start, end), prefix: text.slice(Math.max(0, start - 40), start), suffix: text.slice(end, end + 40) })
}

/** Resolve text after Markdown rendering changes; ambiguous matches remain unpainted.
 * @param text Current rendered text. @param anchor Saved quote and context. @returns Unique matching span, or absence.
 */
export function resolveAnchor(text: string, anchor: Anchor): { start: number; end: number } | undefined {
  const matches: { start: number; score: number }[] = []
  let offset = text.indexOf(anchor.quote)
  while (offset !== -1) {
    const before = text.slice(Math.max(0, offset - anchor.prefix.length), offset)
    const after = text.slice(offset + anchor.quote.length, offset + anchor.quote.length + anchor.suffix.length)
    const score = Number(before === anchor.prefix) + Number(after === anchor.suffix)
    matches.push({ start: offset, score })
    offset = text.indexOf(anchor.quote, offset + 1)
  }
  matches.sort((a, b) => b.score - a.score)
  const best = matches[0]
  if (best === undefined || (matches[1] !== undefined && best.score === matches[1].score)) return undefined
  return { start: best.start, end: best.start + anchor.quote.length }
}
