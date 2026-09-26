import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ExportButton from '../components/ExportButton'
import GapForm from '../components/GapForm'
import { ConfirmDialog, CriticalityBadge, EmptyState, LateBadge, Menu, Progress, StatusBadge, UserName } from '../components/ui'
import { CRITICALITIES, CRITICALITY_BY_ID, GAP_STATUSES, PAGE_SIZE } from '../data/constants'
import { THEMES, getControl, getTheme } from '../data/isoControls'
import { useCompliance } from '../store/ComplianceContext'
import { gapProgress, isGapOverdue, isReviewDue, themeOfGap, weightedScore } from '../utils/compliance'
import { formatDate, relativeDue } from '../utils/dates'
import { exportCsv, exportReport } from '../utils/report'
import { applyParamChanges, type ParamChanges } from '../utils/searchParams'
import type { ApiResult, Gap, GapStatusId, Nis2Id } from '../types'

type SortKey = 'id' | 'title' | 'theme' | 'criticality' | 'status' | 'progress' | 'dueDate' | 'assignee' | 'createdAt'
const SORT_KEYS: SortKey[] = ['id', 'title', 'theme', 'criticality', 'status', 'progress', 'dueDate', 'assignee', 'createdAt']

const STATUS_ORDER = Object.fromEntries(GAP_STATUSES.map((s, i) => [s.id, i])) as Record<GapStatusId, number>
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Titre' },
  { key: 'theme', label: 'Thème' },
  { key: 'criticality', label: 'Criticité' },
  { key: 'status', label: 'Statut' },
  { key: 'progress', label: 'Avancement' },
  { key: 'dueDate', label: 'Échéance' },
  { key: 'assignee', label: 'Assigné' },
  { key: 'createdAt', label: 'Créée le' },
]

const normalize = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export default function GapsInventory() {
  const { state, can, notify, duplicateGap, archiveGap, restoreGap } = useCompliance()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<Gap | null>(null)
  const [search, setSearch] = useState(params.get('q') ?? '')

  const q = params.get('q') ?? ''
  const criticite = params.get('criticite') ?? ''
  const theme = params.get('theme') ?? ''
  const statut = params.get('statut') ?? ''
  const nis2 = params.get('nis2') ?? ''
  const retard = params.get('retard') === '1'
  const archives = params.get('archives') === '1'
  const sortParam = params.get('tri')
  const sort: SortKey = SORT_KEYS.includes(sortParam as SortKey) ? (sortParam as SortKey) : 'criticality'
  const order = params.get('ordre') ?? (sort === 'criticality' ? 'desc' : 'asc')
  const page = Math.max(1, Number(params.get('page') ?? 1))

  const update = (changes: ParamChanges, resetPage = true) => {
    const next = applyParamChanges(params, changes)
    if (resetPage) next.delete('page')
    setParams(next, { replace: true })
  }

  // Recherche plein texte « en temps réel » avec un léger anti-rebond.
  useEffect(() => {
    if (search === q) return
    const t = setTimeout(() => update({ q: search }), 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const filtered = useMemo(() => {
    const nq = normalize(q)
    return state.gaps.filter((g) => {
      if (!archives && g.archived) return false
      if (criticite && g.criticality !== criticite) return false
      if (theme && themeOfGap(g) !== theme) return false
      if (statut === 'ouvertes' ? g.status === 'validee' : statut && g.status !== statut) return false
      if (nis2 && !g.nis2Refs.includes(nis2 as Nis2Id)) return false
      if (retard && !isGapOverdue(g)) return false
      if (nq) {
        const hay = normalize(
          [g.id, g.title, g.description, g.impact, g.anssiRef, ...g.controlIds.map((c) => `a.${c} ${c} ${getControl(c)?.title}`), ...g.nis2Refs].join(' '),
        )
        if (!nq.split(/\s+/).every((w) => hay.includes(w))) return false
      }
      return true
    })
  }, [state.gaps, q, criticite, theme, statut, nis2, retard, archives])

  const sorted = useMemo(() => {
    const val = (g: Gap): string | number => {
      switch (sort) {
        case 'criticality':
          return CRITICALITY_BY_ID[g.criticality].weight
        case 'status':
          return STATUS_ORDER[g.status]
        case 'progress':
          return gapProgress(g, state.remediations)
        case 'theme':
          return themeOfGap(g)
        case 'assignee':
          return state.users.find((u) => u.id === g.assignee)?.name ?? ''
        default:
          return g[sort]
      }
    }
    const dir = order === 'desc' ? -1 : 1
    return [...filtered].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr', { numeric: true })
      return cmp * dir || a.id.localeCompare(b.id)
    })
  }, [filtered, sort, order, state.remediations, state.users])

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const rows = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const active = state.gaps.filter((g) => !g.archived)
  const counts = Object.fromEntries(CRITICALITIES.map((c) => [c.id, filtered.filter((g) => g.criticality === c.id).length]))
  const hasFilters = q || criticite || theme || statut || nis2 || retard

  const toggleSort = (key: SortKey) => {
    if (sort === key) update({ tri: key, ordre: order === 'asc' ? 'desc' : 'asc' }, false)
    else update({ tri: key, ordre: key === 'criticality' || key === 'progress' ? 'desc' : 'asc' }, false)
  }

  const act = async <T,>(pending: Promise<ApiResult<T>>, msg: (result: T) => string) => {
    const res = await pending
    if (!res.ok) notify(res.error, 'error')
    else notify(msg(res.result))
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Inventaire des lacunes</h1>
          <p className="page-head__sub">
            {active.length} lacunes actives · Score global {weightedScore(active, state.remediations)} %
          </p>
        </div>
        <div className="page-head__actions">
          <ExportButton
            label="Exporter"
            items={[
              { icon: 'table', label: 'Export CSV', onClick: () => exportCsv(state) },
              { icon: 'report', label: 'Rapport HTML', onClick: () => exportReport(state) },
            ]}
          />
          {can('edit') && (
            <button className="btn btn--accent" onClick={() => setCreating(true)}>
              + Nouvelle lacune
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <label htmlFor="gap-search" className="sr-only">
            Rechercher
          </label>
          <input id="gap-search" className="input" type="search" placeholder="Chercher une lacune (MFA, chiffrement, A.8.13, 21.2.j…)" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input" aria-label="Filtrer par criticité" value={criticite} onChange={(e) => update({ criticite: e.target.value })}>
          <option value="">Toutes criticités</option>
          {CRITICALITIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Filtrer par thème" value={theme} onChange={(e) => update({ theme: e.target.value })}>
          <option value="">Tous les thèmes</option>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} {t.label}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Filtrer par statut" value={statut} onChange={(e) => update({ statut: e.target.value })}>
          <option value="">Tous les statuts</option>
          <option value="ouvertes">Ouvertes (non validées)</option>
          {GAP_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="toggle">
          <input type="checkbox" checked={retard} onChange={(e) => update({ retard: e.target.checked })} /> En retard
        </label>
        <label className="toggle">
          <input type="checkbox" checked={archives} onChange={(e) => update({ archives: e.target.checked })} /> Archivées
        </label>
      </div>

      <div className="counter-line">
        <span>
          <strong>{filtered.length}</strong> lacune{filtered.length > 1 ? 's' : ''}
        </span>
        {CRITICALITIES.map((c) => (
          <span key={c.id}>
            {c.label}s : <strong>{counts[c.id]}</strong>
          </span>
        ))}
        {nis2 && (
          <span className="chip">
            NIS2 {nis2}
            <button onClick={() => update({ nis2: '' })} aria-label="Retirer le filtre NIS2">
              ×
            </button>
          </span>
        )}
        {hasFilters && (
          <button
            className="link-button small"
            onClick={() => {
              setSearch('')
              setParams({}, { replace: true })
            }}
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {state.gaps.length === 0 ? (
          <EmptyState
            icon="list"
            title="Aucune lacune trouvée"
            action={
              can('edit') && (
                <button className="btn btn--accent" onClick={() => setCreating(true)}>
                  Créer la première →
                </button>
              )
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState icon="search" title="Aucune lacune ne correspond aux filtres">
            Modifiez la recherche ou réinitialisez les filtres.
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.key} aria-sort={sort === c.key ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button onClick={() => toggleSort(c.key)}>
                          {c.label}
                          <span className="sort-icon">{sort === c.key ? (order === 'asc' ? '▲' : '▼') : '↕'}</span>
                        </button>
                      </th>
                    ))}
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g) => {
                    const late = isGapOverdue(g)
                    return (
                      <tr key={g.id} className={`${g.archived ? 'is-archived' : ''} ${late ? 'is-late' : ''}`}>
                        <td className="mono nowrap">
                          <Link to={`/lacunes/${g.id}`}>{g.id}</Link>
                        </td>
                        <td style={{ minWidth: 260 }}>
                          <Link to={`/lacunes/${g.id}`} className="row-link">
                            {g.title}
                          </Link>
                          <div className="tiny muted">
                            {g.controlIds.map((c) => `A.${c}`).join(' · ')}
                            {g.archived && ' · Archivée'}
                            {isReviewDue(g) && ' · revue due'}
                          </div>
                        </td>
                        <td className="nowrap small">{getTheme(themeOfGap(g))?.label}</td>
                        <td>
                          <CriticalityBadge value={g.criticality} />
                        </td>
                        <td>
                          <StatusBadge value={g.status} />
                        </td>
                        <td style={{ minWidth: 120 }}>
                          <Progress value={gapProgress(g, state.remediations)} />
                        </td>
                        <td className="nowrap small">
                          {formatDate(g.dueDate)}
                          {g.status !== 'validee' && !g.archived && (
                            <div className="tiny" style={{ color: late ? 'var(--error-dark)' : 'var(--neutral-500)' }}>
                              {late ? <LateBadge label={relativeDue(g.dueDate)} /> : relativeDue(g.dueDate)}
                            </div>
                          )}
                        </td>
                        <td className="nowrap small">
                          <UserName id={g.assignee} withAvatar />
                        </td>
                        <td className="nowrap small">{formatDate(g.createdAt)}</td>
                        <td>
                          <Menu
                            label={`Actions pour ${g.id}`}
                            items={[
                              { icon: 'file', label: 'Ouvrir', onClick: () => navigate(`/lacunes/${g.id}`) },
                              {
                                icon: 'copy',
                                label: 'Dupliquer',
                                disabled: !can('edit'),
                                onClick: () => act(duplicateGap(g.id), (copy) => `Lacune dupliquée : ${copy.id}`),
                              },
                              g.archived
                                ? { icon: 'restore', label: 'Restaurer', disabled: !can('archive'), title: !can('archive') ? 'Réservé au responsable validant' : undefined, onClick: () => act(restoreGap(g.id), () => `${g.id} restaurée.`) }
                                : { icon: 'archive', label: 'Archiver', disabled: !can('archive'), title: !can('archive') ? 'Réservé au responsable validant' : undefined, onClick: () => setConfirm(g) },
                            ]}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, sorted.length)} sur {sorted.length}
              </span>
              <div className="pagination__pages">
                <button disabled={current === 1} onClick={() => update({ page: current - 1 }, false)} aria-label="Page précédente">
                  ◀
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                  <button key={p} className={p === current ? 'active' : ''} onClick={() => update({ page: p }, false)} aria-current={p === current ? 'page' : undefined}>
                    {p}
                  </button>
                ))}
                <button disabled={current === pageCount} onClick={() => update({ page: current + 1 }, false)} aria-label="Page suivante">
                  ▶
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {creating && <GapForm onClose={() => setCreating(false)} onSaved={(g) => navigate(`/lacunes/${g.id}`)} />}
      {confirm && (
        <ConfirmDialog
          title={`Archiver ${confirm.id}`}
          message="La lacune sera masquée des indicateurs mais conservée avec tout son historique (pas de suppression définitive). Elle pourra être restaurée."
          confirmLabel="Archiver"
          tone="accent"
          withComment
          commentLabel="Motif de l'archivage"
          onClose={() => setConfirm(null)}
          onConfirm={(reason) => {
            act(archiveGap(confirm.id, reason), () => `${confirm.id} archivée.`)
            setConfirm(null)
          }}
        />
      )}
    </div>
  )
}
