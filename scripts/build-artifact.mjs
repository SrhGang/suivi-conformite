/**
 * Construit la version « page hébergée » : un seul fichier HTML autonome
 * (JS et CSS en ligne), sans balises <html>/<head>/<body> — l'hébergeur
 * ajoute lui-même le squelette.
 *
 *   npm run build:artifact   →   artifact/suivi-conformite.html
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'dist-artifact'
execSync(`npx vite build --mode artifact --outDir ${OUT} --emptyOutDir`, { stdio: 'inherit' })

const assets = readdirSync(join(OUT, 'assets'))
const js = assets.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(OUT, 'assets', f), 'utf8'))
const css = assets.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(OUT, 'assets', f), 'utf8'))
if (js.length !== 1) throw new Error(`Un seul bundle JS attendu, trouvé : ${js.length}`)

// Empêche la fermeture prématurée de la balise <script>.
const safeJs = js[0].replace(/<\/script/gi, '<\\/script')

const html = `<title>Suivi de conformité ISO 27001</title>
<meta name="description" content="Suivi des lacunes ISO 27001:2022 / NIS2-ANSSI — prototype interactif">
<style>
${css.join('\n')}
</style>
<div id="root"></div>
<script type="module">
${safeJs}
</script>
`

mkdirSync('artifact', { recursive: true })
writeFileSync('artifact/suivi-conformite.html', html)
console.log(`artifact/suivi-conformite.html — ${(html.length / 1024).toFixed(0)} Ko`)
