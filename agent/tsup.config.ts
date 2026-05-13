import { cpSync } from 'node:fs'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  target: 'node22',
  outDir: 'build',
  clean: true,
  splitting: false,
  sourcemap: true,
  // tsup bundles everything into build/index.js, but src/agent/system-prompt.ts
  // reads system-prompt.md from a path resolved off its own __dirname. After
  // bundling, that __dirname IS build/, so copy the file there.
  onSuccess: async () => {
    cpSync('src/agent/system-prompt.md', 'build/system-prompt.md')
  },
})
