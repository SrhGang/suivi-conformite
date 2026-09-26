/**
 * Export du « document vivant » : rapport HTML autonome (imprimable en PDF),
 * export CSV des lacunes et sauvegarde JSON complète.
 */
import {
  CRITICALITIES,
  CRITICALITY_BY_ID,
  GAP_STATUSES,
  GAP_STATUS_BY_ID,
  REMEDIATION_STATUS_BY_ID,
  REMEDIATION_TYPE_BY_ID,
} from '../data/constants.js'
import { controlLabel, getNis2 } from '../data/isoControls.js'
import {
  activeGaps,
  conformControls,
  gapProgress,
  isGapOverdue,
  isReviewDue,
  scoreByTheme,
  themeOfGap,
  weightedScore,
} from './compliance.js'
import { formatDate, formatDateTime, toISODate } from './dates.js'
import { IS_ARTIFACT } from '../platform.js'

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export const EXPORT_EVENT = 'conformite:export'

export const download = (filename, content, mime) => {
  if (IS_ARTIFACT) {
    // Téléchargement bloqué dans la page hébergée : on affiche le contenu à copier.
    window.dispatchEvent(new CustomEvent(EXPORT_EVENT, { detail: { filename, content, mime } }))
    return
  }
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const userName = (state, id) => state.users.find((u) => u.id === id)?.name ?? '—'

export function buildReportHtml(state) {
  const gaps = activeGaps(state.gaps)
  const { remediations, evidence } = state
  const score = weightedScore(gaps, remediations)
  const themes = scoreByTheme(gaps, remediations)
  const controls = conformControls(gaps)
  const generated = formatDateTime(new Date().toISOString())
  const crit = { critique: '#E74C3C', haute: '#F39C12', moyenne: '#D4AC0D', basse: '#3498DB' }

  const sorted = [...gaps].sort(
    (a, b) =>
      CRITICALITY_BY_ID[b.criticality].weight - CRITICALITY_BY_ID[a.criticality].weight || a.id.localeCompare(b.id),
  )

  const statusRows = GAP_STATUSES.map(
    (s) => `<tr><td>${s.label}</td><td class="num">${gaps.filter((g) => g.status === s.id).length}</td></tr>`,
  ).join('')
  const critRows = CRITICALITIES.map((c) => {
    const list = gaps.filter((g) => g.criticality === c.id)
    return `<tr><td>${c.label} (×${c.weight})</td><td class="num">${list.length}</td><td class="num">${list.filter((g) => g.status === 'validee').length}</td></tr>`
  }).join('')
  const themeRows = themes
    .map(
      (t) =>
        `<tr><td>${t.code} ${t.label}</td><td class="num">${t.total}</td><td class="num">${t.open}</td><td class="num">${t.score} %</td></tr>`,
    )
    .join('')

  const gapSections = sorted
    .map((g) => {
      const rems = remediations.filter((r) => r.gapId === g.id)
      const evs = evidence.filter((e) => e.gapId === g.id)
      const flags = [
        isGapOverdue(g) ? '<span class="flag late">En retard</span>' : '',
        isReviewDue(g) ? '<span class="flag late">Revue due</span>' : '',
      ].join('')
      return `
      <section class="gap">
        <h3><span class="dot" style="background:${crit[g.criticality]}"></span>${esc(g.id)} — ${esc(g.title)} ${flags}</h3>
        <table class="kv">
          <tr><th>Criticité</th><td>${CRITICALITY_BY_ID[g.criticality].label}</td><th>Statut</th><td>${GAP_STATUS_BY_ID[g.status].label} (${gapProgress(g, remediations)} %)</td></tr>
          <tr><th>Échéance</th><td>${formatDate(g.dueDate)}</td><th>Assigné à</th><td>${esc(userName(state, g.assignee))}</td></tr>
          <tr><th>Mesures ISO</th><td colspan="3">${g.controlIds.map((c) => esc(controlLabel(c))).join('<br>')}</td></tr>
          <tr><th>NIS2</th><td colspan="3">${g.nis2Refs.map((n) => esc(getNis2(n)?.label ?? n)).join('<br>') || '—'}</td></tr>
          <tr><th>Réf. ANSSI</th><td colspan="3">${esc(g.anssiRef) || '—'}</td></tr>
          <tr><th>Impact</th><td colspan="3">${esc(g.impact) || '—'}</td></tr>
          ${g.validation ? `<tr><th>Validation</th><td colspan="3">Par ${esc(userName(state, g.validation.by))} le ${formatDate(g.validation.date)}${g.validation.comment ? ` — ${esc(g.validation.comment)}` : ''}. Prochaine revue : ${formatDate(g.nextReviewDate)}</td></tr>` : ''}
        </table>
        <p class="desc">${esc(g.description)}</p>
        ${
          rems.length
            ? `<h4>Moyens mis en place</h4><table class="list"><thead><tr><th>ID</th><th>Action</th><th>Type</th><th>Statut</th><th>Avanc.</th><th>Cible</th><th>Responsable</th></tr></thead><tbody>${rems
                .map(
                  (r) =>
                    `<tr><td>${r.id}</td><td>${esc(r.title)}</td><td>${REMEDIATION_TYPE_BY_ID[r.type]?.label}</td><td>${REMEDIATION_STATUS_BY_ID[r.status]?.label}</td><td class="num">${r.progress} %</td><td>${formatDate(r.targetDate)}</td><td>${esc(userName(state, r.owner))}</td></tr>`,
                )
                .join('')}</tbody></table>`
            : '<p class="muted">Aucune remédiation planifiée.</p>'
        }
        ${evs.length ? `<h4>Preuves</h4><ul>${evs.map((e) => `<li>${esc(e.name)} — ${formatDate(e.uploadedAt)} (${esc(userName(state, e.uploadedBy))})</li>`).join('')}</ul>` : ''}
      </section>`
    })
    .join('')

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Rapport de conformité ISO 27001 / NIS2 — ${esc(state.organization.name)} — ${toISODate(new Date())}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#212529;max-width:1000px;margin:0 auto;padding:32px;line-height:1.5}
  header{background:#0F3460;color:#fff;padding:24px 32px;border-radius:8px;border-bottom:4px solid #E94B3C}
  header h1{margin:0 0 4px;font-size:1.6rem} header p{margin:0;opacity:.9}
  h2{color:#0F3460;border-bottom:2px solid #E9ECEF;padding-bottom:6px;margin-top:32px}
  h3{color:#0F3460;font-size:1.05rem;margin:0 0 8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  h4{margin:12px 0 6px;color:#1B5E8F;font-size:.95rem}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:20px}
  .kpi{border:1px solid #DEE2E6;border-radius:8px;padding:12px 16px} .kpi b{display:block;font-size:1.6rem;color:#0F3460}
  table{border-collapse:collapse;width:100%;font-size:.88rem;margin:8px 0}
  th,td{border:1px solid #DEE2E6;padding:6px 8px;text-align:left;vertical-align:top}
  thead th,.summary th{background:#0F3460;color:#fff}
  .kv th{background:#F8F9FA;width:110px;color:#495057;font-weight:600}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .gap{border:1px solid #DEE2E6;border-radius:8px;padding:16px;margin:16px 0;page-break-inside:avoid}
  .dot{width:10px;height:10px;border-radius:50%;display:inline-block}
  .flag{font-size:.7rem;padding:2px 8px;border-radius:9999px;text-transform:uppercase;font-weight:600}
  .late{background:#FADBD8;color:#C0392B}
  .desc{color:#495057} .muted{color:#6C757D;font-style:italic}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  footer{margin-top:40px;color:#6C757D;font-size:.8rem;text-align:center}
  @media print{body{padding:0} header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<header>
  <h1>Rapport de conformité ISO 27001:2022 / NIS2-ANSSI</h1>
  <p>${esc(state.organization.name)} — ${esc(state.organization.sector)}</p>
  <p>Généré le ${generated} · Dernière mise à jour des données : ${formatDateTime(state.lastUpdated)}</p>
</header>
<div class="kpis">
  <div class="kpi"><b>${score} %</b>Score global pondéré</div>
  <div class="kpi"><b>${gaps.length}</b>Lacunes suivies</div>
  <div class="kpi"><b>${gaps.filter((g) => g.status === 'validee').length}</b>Lacunes validées</div>
  <div class="kpi"><b>${controls.conform}/${controls.total}</b>Mesures ISO sans lacune ouverte</div>
</div>
<h2>Synthèse</h2>
<div class="grid2">
  <table class="summary"><thead><tr><th>Statut</th><th>Nb</th></tr></thead><tbody>${statusRows}</tbody></table>
  <table class="summary"><thead><tr><th>Criticité</th><th>Nb</th><th>Validées</th></tr></thead><tbody>${critRows}</tbody></table>
</div>
<table class="summary"><thead><tr><th>Thème ISO 27001:2022</th><th>Lacunes</th><th>Ouvertes</th><th>Score</th></tr></thead><tbody>${themeRows}</tbody></table>
<p class="muted">Score = Σ(poids × avancement) / Σ(poids) ; poids : Critique ×4, Haute ×3, Moyenne ×2, Basse ×1. Avancement : Non traitée 0 %, En cours 10–75 % selon les remédiations, Corrigée 80 %, Validée 100 %.</p>
<h2>Détail des lacunes (${sorted.length})</h2>
${gapSections}
<footer>Document généré automatiquement par l'outil de suivi de conformité. La correspondance ISO 27001 ↔ NIS2 est indicative.</footer>
</body></html>`
}

export const exportReport = (state) =>
  download(`rapport-conformite-${toISODate(new Date())}.html`, buildReportHtml(state), 'text/html;charset=utf-8')

export const printReport = (state) => {
  if (IS_ARTIFACT) {
    exportReport(state)
    return true
  }
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(buildReportHtml(state))
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
  return true
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

export const exportCsv = (state) => {
  const header = ['ID', 'Titre', 'Thème', 'Mesures ISO', 'NIS2', 'Réf. ANSSI', 'Criticité', 'Statut', 'Avancement %', 'Échéance', 'Assigné à', 'Créé le', 'Archivée']
  const rows = state.gaps.map((g) => [
    g.id,
    g.title,
    themeOfGap(g),
    g.controlIds.map((c) => `A.${c}`).join(' '),
    g.nis2Refs.join(' '),
    g.anssiRef,
    CRITICALITY_BY_ID[g.criticality].label,
    GAP_STATUS_BY_ID[g.status].label,
    gapProgress(g, state.remediations),
    g.dueDate,
    userName(state, g.assignee),
    g.createdAt.slice(0, 10),
    g.archived ? 'oui' : 'non',
  ])
  const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
  download(`lacunes-${toISODate(new Date())}.csv`, csv, 'text/csv;charset=utf-8')
}

export const exportBackup = (state) =>
  download(`sauvegarde-conformite-${toISODate(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json')
