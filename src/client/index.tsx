/** Browser plugin contributes additive slots and lifecycle-owned native text highlights. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import { z } from 'zod'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { recordKey, type Color, type Command, type SparkNoteRecord, type Source } from '../schema.ts'
import { TextHighlighter, type SelectionTarget } from './text-dom.ts'
import { LibraryModel, type LibraryState } from './model.ts'
import { en, zh, type CopyKey } from './locales.ts'
import { CollectionIcon, CollectionPanel, ReplyAction, SelectionOverlay } from './components.tsx'
import styles from './styles.css'

export const inject = ['slots', 'locale', 'connection', 'layout', 'uiWorkspace']
const NS = 'sparknote'
const PANEL = 'sparknote' as MainPanelId

export interface ActionFace {
  hooks: { library: ObservableSnapshot<LibraryState> }
  attach(element: HTMLElement, source: Source, reader?: boolean): void
  detach(element: HTMLElement): void
  change(command: Command, notice: CopyKey): Promise<boolean>
}
export interface LibraryFace extends ActionFace {
  load(): Promise<void>
  openSource(record: SparkNoteRecord): void
  supported: boolean
}
export interface OverlayFace extends Pick<ActionFace, 'hooks'> {
  hooks: ActionFace['hooks'] & { selection: ObservableSnapshot<SelectionTarget | null> }
  applyColor(selection: SelectionTarget, color: Color): void
  erase(selection: SelectionTarget): void
  dismissSelection(): void
  retry(): void
  dismissNotice(): void
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { sparknote: CopyKey }
}

/** @param ctx Browser dependencies; every registration and native resource is released on unload. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }))
  const replySchema = z.union([z.object({ ok: z.literal(true), value: z.unknown() }), z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string(), details: z.object({}) }) })])
  const model = new LibraryModel({ call: async (_channel, endpoint, payload, signal) => {
    const response = await fetch(new URL('api/sparknote', document.baseURI), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: endpoint, payload }), signal })
    if (!response.ok) throw new Error(`SparkNote HTTP ${response.status}`)
    return replySchema.parse(await response.json())
  } })
  const selection = createSnapshotStore<SelectionTarget | null>(null)
  const highlighter = new TextHighlighter(document, value => { selection.set(value) })
  const dismissSelection = (): void => { selection.set(null); document.getSelection()?.removeAllRanges() }
  const face: LibraryFace = {
    hooks: { library: model.state },
    attach: (element, source, reader) => { highlighter.bind(element, source, reader) },
    detach: element => { highlighter.unbind(element) },
    change: (command, notice) => model.change(command, notice),
    load: () => model.load(),
    supported: highlighter.supported,
    openSource: record => {
      try { ctx.uiWorkspace.openSession(String(record.sessionId) as SessionId) }
      catch (error) { console.error('SparkNote source navigation failed', error); model.report('sourceError') }
    },
  }
  const overlay: OverlayFace = {
    hooks: { ...face.hooks, selection }, dismissSelection,
    applyColor: (target, color) => {
      const command: Command = target.highlightId === undefined
        ? { kind: 'highlight', source: target.source, highlight: { id: crypto.randomUUID(), color, anchor: target.anchor } }
        : { kind: 'recolor', key: recordKey(target.source), id: target.highlightId, color }
      void model.change(command, 'highlighted').then(ok => { if (ok) dismissSelection() })
    },
    erase: target => {
      if (target.highlightId === undefined) return
      void model.change({ kind: 'remove-highlight', key: recordKey(target.source), id: target.highlightId }, 'erased').then(ok => { if (ok) dismissSelection() })
    },
    retry: () => { model.retryLast() }, dismissNotice: () => { model.dismissNotice() },
  }
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.sparknote = ''
    style.textContent = styles
    document.head.append(style)
    return () => { style.remove() }
  })
  ctx.effect(() => model.state.subscribe(() => { highlighter.update(model.state.getSnapshot().records) }))
  ctx.effect(() => { const refresh = (): void => { void model.load() }; window.addEventListener('focus', refresh); return () => { window.removeEventListener('focus', refresh) } })
  ctx.on('connection/reset', () => { void model.load() })
  ctx.effect(() => () => { highlighter.dispose(); model.dispose() })
  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({ name: 'conversation.chat.assistant-actions', id: 'sparknote.collect', locale: NS, inject: () => face }, ReplyAction))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'sparknote.toolbar', locale: NS, inject: () => overlay }, SelectionOverlay))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, label: () => ctx.locale.bind(NS)('panel'), order: 20 }, CollectionIcon))
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL, locale: NS, inject: () => face }, CollectionPanel))
  void model.load()
}
