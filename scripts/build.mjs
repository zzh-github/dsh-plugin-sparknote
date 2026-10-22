/** Build the Node entry and DSH browser module factory. */
import { build } from 'esbuild'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
await mkdir(new URL('../lib/', import.meta.url), { recursive: true })
await build({ absWorkingDir: root, entryPoints: ['src/index.ts'], outfile: 'lib/index.js', bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node22', sourcemap: true })
const client = await build({ absWorkingDir: root, entryPoints: ['src/client/index.tsx'], bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022', jsx: 'automatic', loader: { '.css': 'text' }, external: ['react', 'react/jsx-runtime', 'react-dom', 'zod', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives'], define: { 'process.env.NODE_ENV': '"production"' } })
const code = client.outputFiles[0].text
await writeFile(new URL('../lib/client.js', import.meta.url), `window.__ModuleLoader__.load({id:"dsh-sparknote",factory:function(require){const module={exports:{}};const exports=module.exports;\n${code}\nreturn module.exports;}});\n`)
await rm(new URL('../lib/styles.css', import.meta.url), { force: true })
await import(new URL('../lib/index.js', import.meta.url).href)
