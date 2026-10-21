/** Collection labels and question pairing use the projected Turn and durable event ordering. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { collectionTitle, questionForReply } from '../src/client/source.ts'

function location(turn: number): ChatNode['location'] {
  return { kind: 'turn', turn: { turn, start: undefined, end: undefined, status: 'closed', steps: [], data: { get: () => undefined, source: () => ({ getSnapshot: () => undefined, subscribe: () => () => {} }) } } }
}
function user(seq: number, turn: number, text: string, kind: 'user' | 'steering' = 'user'): ChatNode<'user' | 'steering'> {
  const base = { key: `user:${seq}`, id: `user:${seq}`, target: 'chat' as const, anchorSeq: seq, visibility: 'visible' as const, location: location(turn) }
  const data = { seq, time: 0, content: [{ type: 'text' as const, text }], source: { kind: 'user' } }
  return kind === 'user'
    ? { ...base, kind, data: { ...data, kind } }
    : { ...base, kind, data: { ...data, kind, messageId: `message:${seq}` as ChatNode<'steering'>['data']['messageId'] } }
}
function reply(turn: number, seq: number): ChatNode<'assistant-step'> {
  return { key: `reply:${seq}`, id: `reply:${seq}`, kind: 'assistant-step', target: 'chat', anchorSeq: seq, visibility: 'visible', location: location(turn), data: { turn, step: 1, status: 'settled', blocks: [{ kind: 'text', text: 'Useful reply' }], time: 0 } }
}

test('default titles combine the conversation name and the reply opening within the stored limit', () => {
  assert.equal(collectionTitle('Plugin design', 'First insight.\nNext line.'), 'Plugin design · First insight. Next line.')
  const title = collectionTitle('长'.repeat(400), '😀'.repeat(100))
  assert(title.length <= 300)
  assert(!/[\uD800-\uDBFF]$/.test(title))
  assert(title.endsWith('😀'))
})

test('questions match the same Turn and the latest preceding human message, independent of node order', () => {
  const nodes = [user(20, 2, 'Future question'), user(1, 1, 'Original question'), user(6, 1, 'Clarification', 'steering'), user(9, 2, 'Different turn')]
  assert.equal(questionForReply(nodes, reply(1, 8)), 'Clarification')
  assert.equal(questionForReply(nodes, reply(1, 5)), 'Original question')
  assert.equal(questionForReply(nodes, reply(3, 30)), undefined)
  assert.equal(questionForReply([user(20, 1, 'Future')], reply(1, 8)), undefined)
})

test('a loaded textless question is distinct from missing history', () => {
  assert.equal(questionForReply([user(1, 1, '')], reply(1, 3)), '')
})
