/** Prepare a private, keyless real-server run from the repository's recorded Session. */
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { resolve, join } from 'node:path'

const { values } = parseArgs({ options: { 'dsh-root': { type: 'string' } } })
const pluginRoot = fileURLToPath(new URL('../', import.meta.url))
const repo = resolve(values['dsh-root'] ?? join(pluginRoot, '../../DSH'))
const harness = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
if (harness.name !== '@deepseek-ai/dsh-root') throw new Error('Expected a DSH source checkout; pass --dsh-root <path>')
const { sessionDir } = await import(pathToFileURL(join(repo, 'packages/session/session-persistence-jsonl/src/format.ts')).href)
const scratchParent = join(repo, '.playwright-mcp')
await mkdir(scratchParent, { recursive: true })
const run = await mkdtemp(join(scratchParent, 'reading-collection-'))
const home = join(run, 'home'), workspace = join(run, 'workspace')
await mkdir(workspace, { recursive: true })
const rows = (await readFile(join(repo, 'snapshots/web/present/session.v4.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
const id = 'reading-collection-demo'
const normalized = JSON.parse(JSON.stringify(rows).replaceAll('{{session:1}}', id).replaceAll('{{cwd}}', JSON.stringify(workspace).slice(1, -1)))
const physical = normalized.map((row, index) => index === 0 ? row : { ...row, seq: index - 1, time: normalized[0].createdAt + index })
const directory = sessionDir(join(home, 'sessions'), workspace, id)
await mkdir(directory, { recursive: true })
await writeFile(join(directory, 'session.v4.jsonl'), physical.map(row => JSON.stringify(row)).join('\n') + '\n')
const overlay = join(run, 'smoke.overlay.yml')
await writeFile(overlay, `- id: session-persistence-jsonl\n  config:\n    root: ${JSON.stringify(join(home, 'sessions'))}\n    compression: none\n`)
console.log(JSON.stringify({ repo: resolve(repo), home, workspace, overlay, mode: 'keyless recorded-session UI verification' }, null, 2))
