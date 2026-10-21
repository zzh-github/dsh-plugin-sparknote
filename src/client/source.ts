/** Reply context comes from the loaded Chat projection; questions never cross Turn boundaries. */
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-chat/client'

/** @param nodes Loaded projected Chat nodes. @param reply Completed reply. @returns Nearest preceding human input in the same Turn, or absence when not loaded. */
export function questionForReply(nodes: readonly ChatNode[], reply: ChatNode<'assistant-step'>): string | undefined {
  let question: ChatNode<'user' | 'steering'> | undefined
  for (const node of nodes) {
    if (node.kind !== 'user' && node.kind !== 'steering') continue
    if (node.location.kind !== 'turn' && node.location.kind !== 'step') continue
    if (node.location.turn.turn !== reply.data.turn || node.data.seq >= reply.anchorSeq) continue
    if (question === undefined || node.data.seq > question.data.seq) question = node
  }
  if (question === undefined) return undefined
  return question.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n\n')
}

/** @param conversationTitle Displayed conversation name. @param beginning Plain-text reply opening. @returns Default title within the stored 300-code-unit limit. */
export function collectionTitle(conversationTitle: string, beginning: string): string {
  const opening = shorten(beginning.replace(/\s+/g, ' ').trim(), 100)
  return `${shorten(conversationTitle.trim(), 300 - opening.length - 3)} · ${opening}`
}

function shorten(text: string, limit: number): string {
  let result = ''
  for (const character of text) {
    if (result.length + character.length > limit) break
    result += character
  }
  return result
}
