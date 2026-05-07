import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  target: 'node22',
  outDir: 'build',
  clean: true,
  splitting: false,
  sourcemap: true,
})
