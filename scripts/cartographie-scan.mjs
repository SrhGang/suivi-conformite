#!/usr/bin/env node
/**
 * Scanner de la cartographie (sans dépendance).
 *
 * Fait le travail mécanique pour le skill `cartographie` : liste les fichiers,
 * relève les imports, les routes Fastify, les appels /api du front, les écrans
 * React Router et les tables SQL, puis relie chaque appel du front à la route
 * serveur qui y répond. Les agents n'ont plus qu'à nommer et décrire.
 *
 * Usage :
 *   node scripts/cartographie-scan.mjs            résumé + cartographie/.cache/scan.json
 *   node scripts/cartographie-scan.mjs --diff     compare aussi avec cartographie/empreintes.json
 *   node scripts/cartographie-scan.mjs --figer    enregistre les empreintes actuelles (après une carte terminée)
 *
 * Tout ce qui est écrit va dans cartographie/, ignoré par git.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const RACINE = process.cwd()
const SORTIE = join(RACINE, 'cartographie')
const ARGS = new Set(process.argv.slice(2))

const DOSSIERS = ['src', 'server/src', 'server/test', 'server/migrations', 'scripts', 'ops', '.github/workflows']
const FICHIERS_RACINE = ['index.html', 'vite.config.ts', 'Dockerfile', 'docker-compose.yml', 'package.json', 'server/package.json', 'server/build.mjs']
const EXTENSIONS = /\.(tsx?|m?js|sql|sh|ya?ml|json|html|css|conf|service)$|^(Caddyfile|Dockerfile)$/
const IGNORES = /(^|\/)(node_modules|dist|artifact|cartographie|\.git)(\/|$)/
const RESOLUTIONS = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js']

const norm = (p) => p.split('\\').join('/')
const rel = (p) => norm(relative(RACINE, p))

function parcourir(dossier, acc) {
  if (!existsSync(dossier)) return acc
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom)
    if (IGNORES.test(rel(chemin))) continue
    const s = statSync(chemin)
    if (s.isDirectory()) parcourir(chemin, acc)
    else if (EXTENSIONS.test(nom)) acc.push(rel(chemin))
  }
  return acc
}

const liste = [...new Set([
  ...DOSSIERS.flatMap((d) => parcourir(join(RACINE, d), [])),
  ...FICHIERS_RACINE.filter((f) => existsSync(join(RACINE, f))),
])].sort()

const lire = (f) => readFileSync(join(RACINE, f), 'utf8')
const ligneDe = (texte, index) => texte.slice(0, index).split('\n').length

function resoudre(depuis, specifiant) {
  const base = resolve(RACINE, dirname(depuis), specifiant)
  for (const suffixe of RESOLUTIONS) {
    const candidat = base + suffixe
    if (existsSync(candidat) && statSync(candidat).isFile()) return rel(candidat)
  }
  return null
}

// ---------------------------------------------------------------- fichiers
const fichiers = {}
for (const f of liste) {
  const texte = lire(f)
  const entree = {
    lignes: texte.split('\n').length,
    empreinte: createHash('sha256').update(texte).digest('hex').slice(0, 16),
    imports: [],
    paquets: [],
  }
  if (/\.(tsx?|m?js)$/.test(f)) {
    const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm
    for (const m of texte.matchAll(re)) {
      const spec = m[1] ?? m[2] ?? m[3]
      if (spec.startsWith('.')) {
        const cible = resoudre(f, spec)
        if (cible && !entree.imports.includes(cible)) entree.imports.push(cible)
      } else {
        const paquet = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
        if (!entree.paquets.includes(paquet)) entree.paquets.push(paquet)
      }
    }
  }
  fichiers[f] = entree
}
const utilisePar = {}
for (const [f, e] of Object.entries(fichiers)) for (const i of e.imports) (utilisePar[i] ??= []).push(f)

// ---------------------------------------------------------------- routes serveur (Fastify)
const routes = []
for (const f of liste.filter((x) => x.startsWith('server/src/') && /\.ts$/.test(x))) {
  const texte = lire(f)
  const re = /\bapp\.(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*(['"`])(\/[^'"`]*)\2/g
  for (const m of texte.matchAll(re)) {
    routes.push({ cle: `${m[1].toUpperCase()} ${m[3]}`, methode: m[1].toUpperCase(), chemin: m[3], fichier: f, ligne: ligneDe(texte, m.index) })
  }
}

// ---------------------------------------------------------------- appels du front
const appels = []
for (const f of liste.filter((x) => x.startsWith('src/') && /\.tsx?$/.test(x) && !x.includes('__tests__'))) {
  const texte = lire(f)
  const lignes = texte.split('\n')
  const re = /(['"`])(\/api\/[^'"`]*)\1/g
  for (const m of texte.matchAll(re)) {
    const ligne = ligneDe(texte, m.index)
    if (/startsWith\(/.test(lignes[ligne - 1])) continue // test de préfixe, pas un appel
    // La méthode est sur la ligne de l'appel ou la suivante (si elle ne contient pas déjà un autre appel).
    const suivante = lignes[ligne] ?? ''
    const contexte = texte.slice(m.index).split('\n')[0] + (suivante.includes('/api/') ? '' : ` ${suivante}`)
    const chemin = m[2].replace(/\$\{[^}]*\}/g, ':param')
    const methode = (contexte.match(/method:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/) ?? [, 'GET'])[1]
    // Appel rangé dans un objet exporté (ex. `usersApi.list`) : on retient l'objet et la clé
    // pour savoir précisément quels écrans s'en servent.
    let proprietaire = null
    const decl = [...texte.slice(0, m.index).matchAll(/export\s+(?:const|function|class|async function)\s+(\w+)(\s*=\s*\{)?/g)].pop()
    if (decl?.[2]) {
      for (let i = ligne - 1; i >= 0; i--) {
        const k = lignes[i].match(/^\s*(\w+)\s*:/)
        if (k) { proprietaire = `${decl[1]}.${k[1]}`; break }
      }
    }
    appels.push({ methode, chemin, fichier: f, ligne, proprietaire })
  }
}
const segmentsCompatibles = (a, b) => {
  const x = a.split('/'), y = b.split('/')
  return x.length === y.length && x.every((s, i) => s === y[i] || s.startsWith(':') || y[i].startsWith(':'))
}
for (const a of appels) {
  const r = routes.find((r) => r.methode === a.methode && segmentsCompatibles(r.chemin, a.chemin))
  a.route = r ? r.cle : null
}

// ---------------------------------------------------------------- écrans (React Router)
const ecrans = []
for (const f of liste.filter((x) => x.startsWith('src/') && /\.tsx$/.test(x))) {
  const texte = lire(f)
  if (!/<Route\b/.test(texte)) continue
  const importsLocaux = {}
  for (const m of texte.matchAll(/import\s+(\w+)[^'"]*from\s*['"](\.[^'"]+)['"]/g)) importsLocaux[m[1]] = resoudre(f, m[2])
  for (const m of texte.matchAll(/<Route\b([^>]*?)element=\{<(\w+)/g)) {
    const attrs = m[1]
    const chemin = /\bindex\b/.test(attrs) ? '/' : (attrs.match(/path=["']([^"']+)["']/) ?? [])[1]
    // Une route sans chemin est le cadre commun (Layout) qui entoure les écrans.
    const affiche = !chemin ? '(cadre commun)' : chemin === '/' || chemin === '*' ? chemin : `/${chemin}`
    ecrans.push({ chemin: affiche, composant: m[2], fichier: importsLocaux[m[2]] ?? f, declare: `${f}:${ligneDe(texte, m.index)}` })
  }
}
// Ce qu'il y a derrière chaque écran : fichiers atteints par imports, puis appels API de ces fichiers.
function atteints(depart) {
  const vus = new Set([depart])
  const pile = [depart]
  while (pile.length) for (const i of fichiers[pile.pop()]?.imports ?? []) if (!vus.has(i)) { vus.add(i); pile.push(i) }
  return [...vus]
}
for (const e of ecrans) {
  const derriere = e.fichier.endsWith('App.tsx') ? [e.fichier] : atteints(e.fichier)
  const textes = derriere.map(lire).join('\n')
  e.fichiers = derriere
  e.appels = [...new Set(appels
    .filter((a) => derriere.includes(a.fichier) && (!a.proprietaire || new RegExp(`\\b${a.proprietaire.replace('.', '\\.')}\\b`).test(textes)))
    .map((a) => a.route ?? `${a.methode} ${a.chemin} (sans route)`))]
}

// ---------------------------------------------------------------- tables SQL
const tables = []
for (const f of liste.filter((x) => x.endsWith('.sql'))) {
  const texte = lire(f)
  for (const m of texte.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+("?[\w.]+"?)/gi)) tables.push({ nom: m[1].replace(/"/g, ''), fichier: f, ligne: ligneDe(texte, m.index) })
}
const usagesTables = {}
for (const f of liste.filter((x) => x.startsWith('server/src/'))) {
  const texte = lire(f)
  for (const t of tables) if (new RegExp(`\\b(FROM|INTO|UPDATE|JOIN)\\s+${t.nom}\\b`, 'i').test(texte)) (usagesTables[t.nom] ??= []).push(f)
}
for (const t of tables) t.utilisePar = usagesTables[t.nom] ?? []

// ---------------------------------------------------------------- signaux d'architecture (pas de sécurité ici)
const estEntree = (f) => /(^src\/main\.tsx$|^server\/src\/(index|cli)\.ts$|__tests__|^server\/test\/|\.config\.ts$|^scripts\/|\.d\.ts$)/.test(f)
const codeSource = Object.keys(fichiers).filter((f) => /\.(tsx?|m?js)$/.test(f) && (f.startsWith('src/') || f.startsWith('server/src/')))
const signaux = {
  grosFichiers: codeSource.filter((f) => fichiers[f].lignes > 600).map((f) => `${f} (${fichiers[f].lignes} lignes)`),
  sansImporteur: codeSource.filter((f) => !estEntree(f) && !utilisePar[f]),
  partageFrontServeur: codeSource.filter((f) => f.startsWith('src/') && (utilisePar[f] ?? []).some((u) => u.startsWith('server/'))),
  appelsSansRoute: appels.filter((a) => !a.route).map((a) => `${a.methode} ${a.chemin} (${a.fichier}:${a.ligne})`),
  routesNonAppelees: routes.filter((r) => !appels.some((a) => a.route === r.cle)).map((r) => r.cle),
}

// ---------------------------------------------------------------- différences avec la dernière carte
const cheminEmpreintes = join(SORTIE, 'empreintes.json')
let diff = null
if (ARGS.has('--diff')) {
  const avant = existsSync(cheminEmpreintes) ? JSON.parse(readFileSync(cheminEmpreintes, 'utf8')) : null
  if (avant) {
    diff = {
      nouveaux: Object.keys(fichiers).filter((f) => !(f in avant.fichiers)),
      modifies: Object.keys(fichiers).filter((f) => f in avant.fichiers && avant.fichiers[f] !== fichiers[f].empreinte),
      supprimes: Object.keys(avant.fichiers).filter((f) => !(f in fichiers)),
      routesNouvelles: routes.map((r) => r.cle).filter((c) => !avant.routes.includes(c)),
      routesSupprimees: avant.routes.filter((c) => !routes.some((r) => r.cle === c)),
      depuis: avant.date,
    }
  }
}

// ---------------------------------------------------------------- écriture
mkdirSync(join(SORTIE, '.cache'), { recursive: true })
if (!existsSync(join(SORTIE, '.gitignore'))) writeFileSync(join(SORTIE, '.gitignore'), '*\n')
const scan = { date: new Date().toISOString(), fichiers, utilisePar, routes, appels, ecrans, tables, signaux, diff }
writeFileSync(join(SORTIE, '.cache', 'scan.json'), JSON.stringify(scan, null, 2))
if (ARGS.has('--figer')) {
  writeFileSync(cheminEmpreintes, JSON.stringify({
    date: scan.date,
    fichiers: Object.fromEntries(Object.entries(fichiers).map(([f, e]) => [f, e.empreinte])),
    routes: routes.map((r) => r.cle),
  }, null, 2))
}

// ---------------------------------------------------------------- résumé
const parDossier = {}
for (const [f, e] of Object.entries(fichiers)) {
  const d = f.includes('/') ? dirname(f).split('/').slice(0, 2).join('/') : '(racine)'
  parDossier[d] = parDossier[d] ?? { n: 0, l: 0 }
  parDossier[d].n++; parDossier[d].l += e.lignes
}
const out = []
out.push(`FICHIERS  ${liste.length} (${Object.values(fichiers).reduce((s, e) => s + e.lignes, 0)} lignes)`)
for (const [d, v] of Object.entries(parDossier).sort()) out.push(`  ${d.padEnd(22)} ${String(v.n).padStart(3)} fichiers  ${String(v.l).padStart(6)} lignes`)
out.push(`\nÉCRANS  ${ecrans.length}`)
for (const e of ecrans) out.push(`  ${e.chemin.padEnd(16)} ${e.composant.padEnd(16)} ${e.fichier}  →  ${e.appels.length ? e.appels.join(', ') : 'aucun appel direct'}`)
out.push(`\nROUTES API  ${routes.length}`)
for (const r of routes) {
  const qui = [...new Set(appels.filter((a) => a.route === r.cle).map((a) => a.fichier))]
  out.push(`  ${r.cle.padEnd(36)} ${r.fichier}:${r.ligne}  ←  ${qui.join(', ') || '—'}`)
}
out.push(`\nTABLES  ${tables.map((t) => `${t.nom} (${t.utilisePar.map((u) => u.replace('server/src/', '')).join(', ') || '—'})`).join(' · ')}`)
const paquets = [...new Set(Object.values(fichiers).flatMap((e) => e.paquets))].filter((p) => !p.startsWith('node:')).sort()
out.push(`\nPAQUETS EXTERNES  ${paquets.join(', ')}`)
out.push(`\nSIGNAUX D'ARCHITECTURE`)
for (const [k, v] of Object.entries(signaux)) out.push(`  ${k.padEnd(20)} ${v.length ? v.join(' · ') : '—'}`)
if (ARGS.has('--diff')) {
  out.push('\nDIFFÉRENCES')
  if (!diff) out.push('  aucune carte figée : faire une carte complète')
  else for (const [k, v] of Object.entries(diff)) out.push(`  ${k.padEnd(18)} ${Array.isArray(v) ? (v.join(', ') || '—') : v}`)
}
if (ARGS.has('--figer')) out.push('\nEMPREINTES  enregistrées dans cartographie/empreintes.json')
out.push('\nDétail complet : cartographie/.cache/scan.json (gros fichier, ne le lire que par morceaux).')
console.log(out.join('\n'))
