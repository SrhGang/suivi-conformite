// Construit l'API en un seul fichier (dist/index.js et dist/cli.js).
// Le code métier partagé (../src) est intégré au bundle ; les dépendances npm restent externes.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts', 'src/cli.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
})
