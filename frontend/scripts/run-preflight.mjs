// 构建前检查运行器：用 esbuild 把 TS 检查脚本打包成 Node 可执行的 ESM。
// Node 20 不能直接执行 .ts，借助 vite 自带的 esbuild 即可，无需额外依赖。
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, 'preflight.ts')
const tsconfig = join(here, '..', 'tsconfig.json')

const result = await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  write: false,
  tsconfig,
})

const code = result.outputFiles[0].text
// 以 data: URL 方式加载，避免往磁盘写临时文件。
const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`

try {
  await import(moduleUrl)
} catch (error) {
  console.error('构建前检查失败：')
  console.error(error)
  process.exitCode = 1
}
