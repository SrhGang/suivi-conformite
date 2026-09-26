import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import RemediationForm from '../components/RemediationForm'
import { CriticalityDot, EmptyState, LateBadge, Progress, RemTypeBadge, UserName } from '../components/ui'
import { CRITICALITIES, CRITICALITY_BY_ID, REMEDIATION_STATUSES, REMEDIATION_STATUS_BY_ID } from '../data/constants'
import { THEMES } from '../data/isoControls'
import { useCompliance } from '../store/ComplianceContext'
import { activeGaps, isRemediationOverdue, themeOfGap, weightedScore } from '../utils/compliance'
import { addDays, addMonths, diffDays, formatDate, parseDate, toISODate, today } from '../utils/dates'
import { applyParamChanges, type ParamChanges } from '../utils/searchParams'
import type { Gap, ISODate, Remediation, RemediationInput, RemediationStatusId } from '../types'

type SortDir = 'asc' | 'desc'
type GapIndex = Record<string, Gap>
interface DateRange {
  start: ISODate
  end: ISODate
}
/** Glisser en cours sur une barre du Gantt (décalages en jours). */
interface DragState {
  id: string
  mode: 'move' | 'resize'
  startX: number
  dStart: number
  dEnd: number
  moved: boolean
}
interface Tooltip {
  r: Remediation
  x: number
  y: number
}

const PERIODS: { id: string; label: string; months: number | null }[] = [
  { id: '6', label: '6 mois', months: 6 },
  { id: '12', label: '12 mois', months: 12 },
  { id: '18', label: '18 mois', months: 18 },
  { id: 'all', label: 'Tout', months: null },
]

export default function Roadmap() {
  const { state, can } = useCompliance()
  const [params, setParams] = useSearchParams()
  const view = params.get('vue') === 'kanban' ? 'kanban' : 'gantt'
  const criticite = params.get('criticite') ?? ''
  const theme = params.get('theme') ?? ''
  const period = params.get('periode') ?? '12'
  const hideDone = params.get('masquer') === '1'
  const focus = params.get('focus')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editing, setEditing] = useState<Remediation | 'new' | null>(null)

  const update = (changes: ParamChanges) => {
    setParams(applyParamChanges(params, changes), { replace: true })
  }

  const gapIndex = useMemo<GapIndex>(() => Object.fromEntries(state.gaps.map((g) => [g.id, g])), [state.gaps])

  const items = useMemo(() => {
    const list = state.remediations.filter((r) => {
      const g = gapIndex[r.gapId]
      if (!g || g.archived) return false
      if (criticite && g.criticality !== criticite) return false
      if (theme && themeOfGap(g) !== theme) return false
      if (hideDone && view === 'gantt' && r.status === 'valide') return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    // Les remédiations validées passent en fin de liste, les autres par date cible.
    return list.sort(
      (a, b) =>
        Number(a.status === 'valide') - Number(b.status === 'valide') ||
        dir * a.targetDate.localeCompare(b.targetDate) ||
        CRITICALITY_BY_ID[gapIndex[b.gapId].criticality].weight - CRITICALITY_BY_ID[gapIndex[a.gapId].criticality].weight,
    )
  }, [state.remediations, gapIndex, criticite, theme, hideDone, view, sortDir])

  const all = state.remediations.filter((r) => !gapIndex[r.gapId]?.archived)
  const stats = {
    total: all.length,
    late: all.filter((r) => isRemediationOverdue(r)).length,
    blocked: all.filter((r) => r.status === 'bloque').length,
    done: all.filter((r) => r.status === 'valide').length,
  }

  // Période affichée (Gantt) — de 1 mois avant aujourd'hui jusqu'à N mois après.
  const range = useMemo<DateRange>(() => {
    const p = PERIODS.find((x) => x.id === period) ?? PERIODS[1]
    if (p.months) return { start: addMonths(today(), -1), end: addDays(addMonths(today(), p.months), 21) }
    const dates = [...state.remediations.flatMap((r) => [r.startDate, r.targetDate]), ...state.milestones.map((m) => m.date), today()].sort()
    return { start: addDays(dates[0], -7), end: addDays(dates[dates.length - 1], 14) }
  }, [period, state.remediations, state.milestones])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Roadmap de conformité ISO 27001 / NIS2-ANSSI</h1>
          <p className="page-head__sub">
            Plan d'action : {formatDate(range.start)} → {formatDate(range.end)} · Score actuel {weightedScore(activeGaps(state.gaps), state.remediations)} %
          </p>
        </div>
        <div className="page-head__actions">
          <div className="segmented" role="group" aria-label="Vue">
            <button className={view === 'gantt' ? 'active' : ''} onClick={() => update({ vue: '' })}>
              Gantt
            </button>
            <button className={view === 'kanban' ? 'active' : ''} onClick={() => update({ vue: 'kanban' })}>
              Kanban
            </button>
          </div>
          {can('edit') && (
            <button className="btn btn--accent" onClick={() => setEditing('new')}>
              + Nouvelle remédiation
            </button>
          )}
        </div>
      </div>

      <div className="roadmap-summary">
        <div className="mini-stat">
          <b>{stats.total}</b>
          <span>remédiations planifiées</span>
        </div>
        <div className="mini-stat">
          <b style={{ color: stats.late ? 'var(--error-dark)' : undefined }}>{stats.late}</b>
          <span>en retard</span>
        </div>
        <div className="mini-stat">
          <b>{stats.blocked}</b>
          <span>bloquées</span>
        </div>
        <div className="mini-stat">
          <b style={{ color: 'var(--success-dark)' }}>{stats.done}</b>
          <span>validées</span>
        </div>
      </div>

      <div className="toolbar">
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
        {view === 'gantt' && (
          <>
            <select className="input" aria-label="Période" value={period} onChange={(e) => update({ periode: e.target.value === '12' ? '' : e.target.value })}>
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  Période : {p.label}
                </option>
              ))}
            </select>
            <label className="toggle">
              <input type="checkbox" checked={hideDone} onChange={(e) => update({ masquer: e.target.checked })} /> Masquer les validées
            </label>
          </>
        )}
        <span className="legend" style={{ marginLeft: 'auto' }}>
          {CRITICALITIES.map((c) => (
            <span key={c.id}>
              <CriticalityDot value={c.id} /> {c.label}
            </span>
          ))}
        </span>
      </div>

      {state.remediations.length === 0 ? (
        <div className="card">
          <EmptyState icon="calendar" title="Aucune remédiation planifiée">
            Créez la première depuis le détail d'une lacune (onglet Remédiations) ou avec le bouton « Nouvelle remédiation ».
          </EmptyState>
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState icon="search" title="Aucune remédiation ne correspond aux filtres" />
        </div>
      ) : view === 'gantt' ? (
        <Gantt items={items} gapIndex={gapIndex} range={range} focus={focus} sortDir={sortDir} onSort={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} onOpen={setEditing} />
      ) : (
        <Kanban items={items} gapIndex={gapIndex} onOpen={setEditing} />
      )}

      {can('edit') && view === 'gantt' && (
        <p className="tiny muted" style={{ marginTop: 12 }}>
          Astuce : glissez une barre pour décaler la remédiation, tirez son bord droit pour modifier la date cible, cliquez pour l'ouvrir.
        </p>
      )}

      {editing && <RemediationForm remediation={editing === 'new' ? null : editing} showGapLink onClose={() => setEditing(null)} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Vue Gantt                                                           */
/* ------------------------------------------------------------------ */

interface GanttProps {
  items: Remediation[]
  gapIndex: GapIndex
  range: DateRange
  focus: string | null
  sortDir: SortDir
  onSort: () => void
  onOpen: (r: Remediation) => void
}

function Gantt({ items, gapIndex, range, focus, sortDir, onSort, onOpen }: GanttProps) {
  const { state, can, updateRemediation, notify } = useCompliance()
  const trackRef = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(800)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [tip, setTip] = useState<Tooltip | null>(null)
  const totalDays = Math.max(1, diffDays(range.end, range.start))
  const pxPerDay = trackWidth / totalDays
  const pct = (date: ISODate) => (diffDays(date, range.start) / totalDays) * 100
  const score = weightedScore(activeGaps(state.gaps), state.remediations)
  const todayStr = today()
  const editable = can('edit')

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setTrackWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!focus) return
    document.getElementById(`gantt-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus])

  const months = useMemo(() => {
    const out: ISODate[] = []
    const d = parseDate(range.start)
    d.setDate(1)
    while (toISODate(d) <= range.end) {
      out.push(toISODate(d))
      d.setMonth(d.getMonth() + 1)
    }
    return out
  }, [range])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>, r: Remediation, mode: DragState['mode']) => {
    if (!editable || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setTip(null)
    setDrag({ id: r.id, mode, startX: e.clientX, dStart: 0, dEnd: 0, moved: false })
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const days = Math.round((e.clientX - drag.startX) / pxPerDay)
    const moved = drag.moved || Math.abs(e.clientX - drag.startX) > 3
    setDrag((d) => (d ? { ...d, moved, dStart: d.mode === 'move' ? days : 0, dEnd: days } : d))
  }
  const onPointerUp = async (r: Remediation) => {
    if (!drag) return
    const { moved, dStart, dEnd } = drag
    setDrag(null)
    if (!moved) {
      onOpen(r)
      return
    }
    if (!dStart && !dEnd) return
    const startDate = addDays(r.startDate, dStart)
    let targetDate = addDays(r.targetDate, dEnd)
    if (targetDate < startDate) targetDate = startDate
    const res = await updateRemediation(r.id, { startDate, targetDate })
    if (!res.ok) notify(res.error, 'error')
    else notify(`${r.id} : échéance au ${formatDate(targetDate)}.`)
  }

  const milestoneState = (m: { date: ISODate; target: number }) => (score >= m.target ? 'is-reached' : m.date < todayStr ? 'is-missed' : '')

  return (
    <div className="gantt">
      <div className="gantt__scroll">
        <div className="gantt__grid">
          <div className="gantt__row gantt__header">
            <div className="gantt__label">
              <button onClick={onSort} aria-label="Trier par date cible">
                Remédiation · date cible {sortDir === 'asc' ? '▲' : '▼'}
              </button>
            </div>
            <div className="gantt__track" ref={trackRef}>
              {months.filter((m) => pct(m) >= 0 && pct(m) < 97).map((m) => (
                <div key={m} className="gantt__month" style={{ left: `${pct(m)}%` }}>
                  {parseDate(m).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
                </div>
              ))}
            </div>
          </div>

          <div className="gantt__row gantt__milestones-row">
            <div className="gantt__label">
              <strong className="small" style={{ color: 'var(--text-title)' }}>
                Jalons
              </strong>
              <span className="sub">Objectif de score global</span>
            </div>
            <div className="gantt__track">
              {state.milestones
                .filter((m) => m.date >= range.start && m.date <= range.end)
                .map((m) => (
                  <div key={m.id} className={`milestone-flag ${milestoneState(m)}`} style={pct(m.date) > 80 ? { left: `${pct(m.date)}%`, transform: 'translateX(calc(-100% + 9px))', flexDirection: 'row-reverse' } : { left: `${pct(m.date)}%` }} title={`${m.label} — objectif ${m.target} % le ${formatDate(m.date)} (actuel : ${score} %)`}>
                    <span className="diamond" />
                    {m.target} % · {formatDate(m.date)}
                  </div>
                ))}
              <div className="gantt__today" style={{ left: `${pct(todayStr)}%` }} />
            </div>
          </div>

          {items.map((r) => {
            const g = gapIndex[r.gapId]
            const isDrag = drag?.id === r.id
            const start = isDrag ? addDays(r.startDate, drag.dStart) : r.startDate
            let end = isDrag ? addDays(r.targetDate, drag.dEnd) : r.targetDate
            if (end < start) end = start
            const left = pct(start)
            const width = Math.max(0.4, pct(addDays(end, 1)) - left)
            const late = isRemediationOverdue(r)
            const visible = left < 100 && left + width > 0
            return (
              <div key={r.id} className="gantt__row" id={`gantt-${r.id}`} style={focus === r.id ? { background: 'var(--primary-50)' } : undefined}>
                <div className="gantt__label">
                  <button onClick={() => onOpen(r)} title={r.title}>
                    <span className="mono tiny">{r.id}</span> {r.title}
                  </button>
                  <span className="sub">
                    <Link to={`/lacunes/${g.id}?onglet=remediations`}>{g.id}</Link> · {REMEDIATION_STATUS_BY_ID[r.status].label} · <UserName id={r.owner} />
                  </span>
                </div>
                <div className="gantt__track">
                  {months.map((m) => (
                    <div key={m} className="gantt__gridline" style={{ left: `${pct(m)}%` }} />
                  ))}
                  {state.milestones.map((m) => (
                    <div key={m.id} className="gantt__milestone" style={{ left: `${pct(m.date)}%` }} />
                  ))}
                  <div className="gantt__today" style={{ left: `${pct(todayStr)}%` }} />
                  {visible ? (
                    <div
                      className={`gantt__bar gantt__bar--${g.criticality} ${late ? 'is-late' : ''} ${r.status === 'valide' ? 'is-done' : ''} ${isDrag ? 'is-dragging' : ''}`}
                      style={{ left: `${left}%`, width: `${width}%`, cursor: editable ? undefined : 'pointer' }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${r.id} ${r.title}, du ${formatDate(r.startDate)} au ${formatDate(r.targetDate)}, ${r.progress} %`}
                      onKeyDown={(e) => e.key === 'Enter' && onOpen(r)}
                      onPointerDown={(e) => (editable ? onPointerDown(e, r, 'move') : null)}
                      onPointerMove={onPointerMove}
                      onPointerUp={() => (editable ? onPointerUp(r) : onOpen(r))}
                      onMouseEnter={(e) => !drag && setTip({ r, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => !drag && setTip({ r, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setTip(null)}
                    >
                      <div className="gantt__bar-fill" style={{ width: `${r.progress}%` }} />
                      <span className="gantt__bar-label">
                        {isDrag ? `${formatDate(start)} → ${formatDate(end)}` : `${r.progress} %`}
                      </span>
                      {editable && <div className="gantt__handle" onPointerDown={(e) => onPointerDown(e, r, 'resize')}
                          onPointerMove={(e) => {
                            e.stopPropagation()
                            onPointerMove(e)
                          }}
                          onPointerUp={(e) => {
                            e.stopPropagation()
                            onPointerUp(r)
                          }} title="Modifier la date cible" />}
                    </div>
                  ) : (
                    <span className="tiny muted" style={{ position: 'absolute', top: 14, [left >= 100 ? 'right' : 'left']: 8 }}>
                      {left >= 100 ? `→ ${formatDate(r.targetDate)}` : `← ${formatDate(r.targetDate)}`}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {tip && (
        <div className="gantt__tooltip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 340), top: tip.y + 14 }}>
          <strong>
            {tip.r.id} · {tip.r.title}
          </strong>
          <div>
            {formatDate(tip.r.startDate)} → {formatDate(tip.r.targetDate)} · {tip.r.progress} %
          </div>
          <div>
            {REMEDIATION_STATUS_BY_ID[tip.r.status].label} · Lacune {tip.r.gapId} ({CRITICALITY_BY_ID[gapIndex[tip.r.gapId].criticality].label})
          </div>
          {isRemediationOverdue(tip.r) && <div className="gantt__tooltip-late">En retard de {-diffDays(tip.r.targetDate, today())} j</div>}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Vue Kanban                                                          */
/* ------------------------------------------------------------------ */

function Kanban({ items, gapIndex, onOpen }: { items: Remediation[]; gapIndex: GapIndex; onOpen: (r: Remediation) => void }) {
  const { can, updateRemediation, notify } = useCompliance()
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<RemediationStatusId | null>(null)
  const editable = can('edit')

  const drop = async (status: RemediationStatusId) => {
    setOver(null)
    const r = items.find((x) => x.id === dragId)
    setDragId(null)
    if (!r || r.status === status) return
    const changes: Partial<RemediationInput> = { status }
    if (status === 'valide') changes.progress = 100
    else if (r.status === 'valide') changes.progress = 90
    const res = await updateRemediation(r.id, changes)
    if (!res.ok) notify(res.error, 'error')
    else notify(`${r.id} → ${REMEDIATION_STATUS_BY_ID[status].label}`)
  }

  return (
    <div className="kanban">
      {REMEDIATION_STATUSES.map((col) => {
        const cards = items.filter((r) => r.status === col.id)
        return (
          <section
            key={col.id}
            className={`kanban__col kanban__col--${col.id} ${over === col.id ? 'is-over' : ''}`}
            aria-label={col.label}
            onDragOver={(e) => {
              if (!editable || !dragId) return
              e.preventDefault()
              setOver(col.id)
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(null)}
            onDrop={(e) => {
              e.preventDefault()
              drop(col.id)
            }}
          >
            <div className="kanban__col-head">
              <span>{col.label}</span>
              <span className="badge badge--neutral">{cards.length}</span>
            </div>
            <div className="kanban__cards">
              {cards.map((r) => {
                const g = gapIndex[r.gapId]
                const late = isRemediationOverdue(r)
                return (
                  <article
                    key={r.id}
                    className={`kcard kcard--${g.criticality} ${late ? 'is-late' : ''} ${dragId === r.id ? 'is-dragging' : ''}`}
                    draggable={editable}
                    onDragStart={(e) => {
                      setDragId(r.id)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', r.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOver(null)
                    }}
                    onClick={() => onOpen(r)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onOpen(r)}
                    style={{ cursor: editable ? 'grab' : 'pointer' }}
                  >
                    <div className="kcard__id">
                      <span className="mono">{r.id}</span>
                      <Link to={`/lacunes/${g.id}`} onClick={(e) => e.stopPropagation()}>
                        {g.id}
                      </Link>
                    </div>
                    <div className="kcard__title">{r.title}</div>
                    <RemTypeBadge value={r.type} />
                    <div style={{ marginTop: 8 }}>
                      <Progress value={r.progress} />
                    </div>
                    <div className="kcard__meta">
                      <span>
                        <UserName id={r.owner} withAvatar />
                      </span>
                      <span style={{ color: late ? 'var(--error-dark)' : undefined, fontWeight: late ? 600 : undefined }}>{formatDate(r.targetDate)}</span>
                    </div>
                    {late && (
                      <div style={{ marginTop: 6 }}>
                        <LateBadge />
                      </div>
                    )}
                  </article>
                )
              })}
              {!cards.length && <p className="tiny muted" style={{ textAlign: 'center', padding: 16 }}>Déposez une carte ici</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
