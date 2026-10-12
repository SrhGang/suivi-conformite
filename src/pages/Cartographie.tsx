import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AssetForm from '../components/AssetForm'
import Icon from '../components/Icon'
import { ConfirmDialog, CriticalityBadge, EmptyState, Health, Progress, RemStatusBadge, StatusBadge } from '../components/ui'
import { ASSET_TYPE_BY_ID, ASSET_TYPES, ZONE_BY_ID, ZONES } from '../data/assets'
import { useCompliance } from '../store/ComplianceContext'
import type { Asset, ZoneId } from '../types'
import { applyParamChanges } from '../utils/searchParams'
import { assetHealth, gapProgress, gapsOfAsset, isOpen, type AssetHealth } from '../utils/compliance'

/* ------------------------------------------------------------------ */
/* Géométrie de la carte                                               */
/* ------------------------------------------------------------------ */

const ZONE_GAP = 16
const HEADER_H = 58
const NODE_W = 104
const NODE_H = 86
const CELL_W = 116
const CELL_H = 100
const PAD = 8
/** Au-delà de deux actifs, une zone passe sur deux colonnes. */
const zoneCols = (count: number) => (count > 2 ? 2 : 1)

const HEALTH: Record<AssetHealth, { label: string; tone: 'error' | 'warning' | 'success' | 'neutral' }> = {
  critical: { label: 'Lacune critique ou haute non traitée', tone: 'error' },
  warning: { label: 'Lacunes ouvertes en cours de traitement', tone: 'warning' },
  ok: { label: 'Lacunes toutes validées', tone: 'success' },
  unknown: { label: 'Aucune lacune rattachée', tone: 'neutral' },
}

interface Placed {
  asset: Asset
  x: number
  y: number
}

interface ZoneBox {
  id: ZoneId
  x: number
  w: number
}

/** Place les actifs : position enregistrée, sinon grille dans leur zone. La largeur des zones suit leur contenu. */
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function layout(assets: Asset[]): { placed: Placed[]; zones: ZoneBox[]; width: number; height: number } {
  const placed: Placed[] = []
  const zones: ZoneBox[] = []
  let x = 0
  let maxY = 300
  for (const z of ZONES) {
    const inZone = assets.filter((a) => a.zone === z.id)
    const cols = zoneCols(inZone.length)
    const w = cols * CELL_W + 2 * PAD
    zones.push({ id: z.id, x, w })
    inZone
      .filter((a) => !a.position)
      .forEach((a, i) => placed.push({ asset: a, x: x + PAD + (i % cols) * CELL_W + (CELL_W - NODE_W) / 2, y: HEADER_H + Math.floor(i / cols) * CELL_H }))
    for (const a of inZone.filter((a) => a.position)) placed.push({ asset: a, x: clamp(a.position!.x, x + 2, x + w - NODE_W - 2), y: a.position!.y })
    x += w + ZONE_GAP
  }
  for (const p of placed) maxY = Math.max(maxY, p.y + NODE_H + 20)
  return { placed, zones, width: x - ZONE_GAP, height: maxY }
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Cartographie() {
  const { state, can } = useCompliance()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('actif')
  const view = params.get('vue') === 'liste' ? 'liste' : 'carte'
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [health, setHealth] = useState('')
  const [creating, setCreating] = useState(false)

  const select = useCallback((id: string | null) => setParams((p) => applyParamChanges(p, { actif: id }), { replace: true }), [setParams])
  const setView = (v: 'carte' | 'liste') => setParams((p) => applyParamChanges(p, { vue: v === 'liste' ? 'liste' : null }), { replace: true })

  const assets = state.assets.filter((a) => !a.archived)
  const matches = useCallback(
    (a: Asset) => {
      const nq = q.trim().toLowerCase()
      if (nq && !`${a.name} ${a.role} ${a.id}`.toLowerCase().includes(nq)) return false
      if (type && a.type !== type) return false
      if (health && assetHealth(a, state.gaps) !== health) return false
      return true
    },
    [q, type, health, state.gaps],
  )
  const filtering = !!(q || type || health)
  const selected = state.assets.find((a) => a.id === selectedId) ?? null
  const counts = useMemo(() => {
    const c: Record<AssetHealth, number> = { critical: 0, warning: 0, ok: 0, unknown: 0 }
    for (const a of assets) c[assetHealth(a, state.gaps)]++
    return c
  }, [assets, state.gaps])

  if (!state.settings.modules.cartographie)
    return (
      <div className="page">
        <div className="card">
          <EmptyState icon="map" title="Module cartographie désactivé">
            L’administrateur peut l’activer dans l’administration. Les données déjà saisies sont conservées.
          </EmptyState>
        </div>
      </div>
    )

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Cartographie de l’infrastructure</h1>
          <p className="page-head__sub">
            {assets.length} actif{assets.length > 1 ? 's' : ''} · couleur selon les lacunes rattachées · cliquez sur un élément pour voir ses lacunes,
            remédiations et preuves
          </p>
        </div>
        <div className="page-head__actions">
          <div className="segmented" role="group" aria-label="Affichage">
            <button className={view === 'carte' ? 'active' : ''} onClick={() => setView('carte')} aria-pressed={view === 'carte'}>
              Carte
            </button>
            <button className={view === 'liste' ? 'active' : ''} onClick={() => setView('liste')} aria-pressed={view === 'liste'}>
              Liste
            </button>
          </div>
          {can('edit') && (
            <button className="btn btn--accent" onClick={() => setCreating(true)}>
              + Nouvel actif
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <label htmlFor="asset-search" className="sr-only">
            Rechercher un actif
          </label>
          <input id="asset-search" className="input" type="search" placeholder="Chercher un actif (nom, rôle, ACT-…)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" aria-label="Filtrer par type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tous les types</option>
          {ASSET_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Filtrer par état" value={health} onChange={(e) => setHealth(e.target.value)}>
          <option value="">Tous les états</option>
          {(Object.keys(HEALTH) as AssetHealth[]).map((h) => (
            <option key={h} value={h}>
              {HEALTH[h].label} ({counts[h]})
            </option>
          ))}
        </select>
      </div>

      <div className="map-legend" aria-label="Légende">
        {(Object.keys(HEALTH) as AssetHealth[]).map((h) => (
          <button key={h} type="button" className={`map-legend__item ${health === h ? 'is-active' : ''}`} onClick={() => setHealth(health === h ? '' : h)}>
            <Health tone={HEALTH[h].tone}>
              {HEALTH[h].label} : <strong>{counts[h]}</strong>
            </Health>
          </button>
        ))}
      </div>

      <div className={`map-layout ${selected ? 'has-panel' : ''}`}>
        {view === 'carte' ? (
          <MapCanvas assets={assets} selectedId={selected?.id ?? null} onSelect={select} matches={filtering ? matches : null} />
        ) : (
          <AssetList assets={state.assets.filter((a) => (filtering ? matches(a) : true))} selectedId={selected?.id ?? null} onSelect={select} />
        )}
        {selected && <AssetPanel asset={selected} onClose={() => select(null)} onSelect={select} />}
      </div>

      {!assets.length && (
        <div className="card" style={{ marginTop: 16 }}>
          <EmptyState icon="map" title="Aucun actif pour l’instant">
            Ajoutez vos serveurs, équipements réseau, applications et fournisseurs, puis rattachez-leur les lacunes qui les concernent.
          </EmptyState>
        </div>
      )}

      {creating && <AssetForm onClose={() => setCreating(false)} onSaved={(a) => select(a.id)} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Carte SVG : zoom, déplacement, glisser-déposer                      */
/* ------------------------------------------------------------------ */

interface MapProps {
  assets: Asset[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  matches: ((a: Asset) => boolean) | null
}

type Drag =
  | { kind: 'pan'; startX: number; startY: number; box: ViewBox; moved: boolean }
  | { kind: 'node'; id: string; zone: ZoneId; offX: number; offY: number; startX: number; startY: number; moved: boolean }

function MapCanvas({ assets, selectedId, onSelect, matches }: MapProps) {
  const { state, can, moveAsset, notify } = useCompliance()
  const svgRef = useRef<SVGSVGElement>(null)
  const { placed, zones, width, height } = useMemo(() => layout(assets), [assets])
  const full: ViewBox = useMemo(() => ({ x: -16, y: -16, w: width + 32, h: height + 32 }), [width, height])
  const [box, setBox] = useState<ViewBox>(full)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(null)
  const editable = can('edit')

  // Sur petit écran, la vue d'ensemble serait illisible : on part de l'échelle 1:1, en haut à gauche.
  useEffect(() => {
    const svg = svgRef.current
    if (svg && full.w / svg.clientWidth > 2) setBox({ x: full.x, y: full.y, w: svg.clientWidth, h: svg.clientHeight })
    else setBox(full)
  }, [full])

  // Sélection : la vue se centre sur l'actif, à une échelle lisible (1:1).
  const focusPos = placed.find((p) => p.asset.id === selectedId)
  const fx = focusPos?.x
  const fy = focusPos?.y
  useEffect(() => {
    const svg = svgRef.current
    if (fx === undefined || fy === undefined || !svg) return
    // Carte entièrement lisible à l'échelle 1:1 : rien à recadrer.
    if (full.w <= svg.clientWidth && full.h <= svg.clientHeight) return setBox(full)
    const w = Math.min(svg.clientWidth, full.w)
    const h = (w / svg.clientWidth) * svg.clientHeight
    setBox({ x: fx + NODE_W / 2 - w / 2, y: Math.max(-16, fy + NODE_H / 2 - h * 0.4), w, h })
  }, [selectedId, fx, fy, full])

  const pos = new Map(placed.map((p) => [p.asset.id, ghost?.id === p.asset.id ? { x: ghost.x, y: ghost.y } : { x: p.x, y: p.y }]))
  const toWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: p.x, y: p.y }
  }

  const zoom = (factor: number, cx?: number, cy?: number) =>
    setBox((b) => {
      const w = clamp(b.w * factor, 280, full.w * 2.5)
      const h = (w / b.w) * b.h
      const fx = cx ?? b.x + b.w / 2
      const fy = cy ?? b.y + b.h / 2
      return { x: fx - ((fx - b.x) * w) / b.w, y: fy - ((fy - b.y) * h) / b.h, w, h }
    })

  // Écouteur natif non passif : la molette zoome la carte sans faire défiler la page.
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault()
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
      zoomRef.current(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const onBackgroundDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    setDrag({ kind: 'pan', startX: e.clientX, startY: e.clientY, box, moved: false })
  }

  const onNodeDown = (e: ReactPointerEvent<SVGGElement>, p: Placed) => {
    if (e.button !== 0) return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    const w = toWorld(e.clientX, e.clientY)
    const cur = pos.get(p.asset.id)!
    setDrag({ kind: 'node', id: p.asset.id, zone: p.asset.zone, offX: w.x - cur.x, offY: w.y - cur.y, startX: e.clientX, startY: e.clientY, moved: false })
  }

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return
    const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4
    if (drag.kind === 'pan') {
      const svg = svgRef.current!
      const scale = drag.box.w / svg.clientWidth
      setBox({ ...drag.box, x: drag.box.x - (e.clientX - drag.startX) * scale, y: drag.box.y - (e.clientY - drag.startY) * scale })
    } else if (editable && moved) {
      const w = toWorld(e.clientX, e.clientY)
      const zb = zones.find((z) => z.id === drag.zone)!
      setGhost({ id: drag.id, x: clamp(w.x - drag.offX, zb.x + 2, zb.x + zb.w - NODE_W - 2), y: clamp(w.y - drag.offY, HEADER_H - 6, 4000) })
    }
    if (moved !== drag.moved) setDrag({ ...drag, moved })
  }

  const onUp = async () => {
    const d = drag
    setDrag(null)
    if (!d) return
    if (d.kind === 'pan') {
      if (!d.moved) onSelect(null)
      return
    }
    if (!d.moved || !ghost) return onSelect(d.id)
    const target = ghost
    const res = await moveAsset(d.id, { x: Math.round(target.x / 10) * 10, y: Math.round(target.y / 10) * 10 })
    setGhost(null)
    if (!res.ok) notify(res.error, 'error')
  }

  const selectedAsset = assets.find((a) => a.id === selectedId)
  const neighbours = new Set(selectedAsset?.links ?? [])
  const edges = useMemo(() => {
    const seen = new Set<string>()
    const list: [string, string][] = []
    for (const a of assets)
      for (const l of a.links) {
        const key = [a.id, l].sort().join('|')
        if (!seen.has(key) && assets.some((x) => x.id === l)) {
          seen.add(key)
          list.push([a.id, l])
        }
      }
    return list
  }, [assets])

  return (
    <div className="card map-card">
      <svg
        ref={svgRef}
        className={`map ${drag?.kind === 'pan' && drag.moved ? 'is-panning' : ''}`}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        role="application"
        aria-label="Carte de l’infrastructure. Utilisez Tab pour parcourir les actifs et Entrée pour ouvrir le détail ; la vue Liste offre la même information."
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={() => void onUp()}
      >
        {zones.map((zb) => {
          const z = ZONE_BY_ID[zb.id]
          return (
            <g key={z.id} className={`map-zone map-zone--${z.id}`}>
              <rect x={zb.x} y={0} width={zb.w} height={height} rx={10} />
              <text x={zb.x + 12} y={24} className="map-zone__title">
                {z.label}
              </text>
              <text x={zb.x + 12} y={42} className="map-zone__sub">
                {short(z.description, zb.w > 200 ? 34 : 18)}
              </text>
            </g>
          )
        })}
        {edges.map(([a, b]) => {
          const pa = pos.get(a)
          const pb = pos.get(b)
          if (!pa || !pb) return null
          const active = selectedId === a || selectedId === b
          return (
            <line
              key={`${a}-${b}`}
              className={`map-edge ${active ? 'is-active' : ''} ${selectedId && !active ? 'is-dim' : ''}`}
              x1={pa.x + NODE_W / 2}
              y1={pa.y + NODE_H / 2}
              x2={pb.x + NODE_W / 2}
              y2={pb.y + NODE_H / 2}
            />
          )
        })}
        {placed.map((p) => {
          const a = p.asset
          const { x, y } = pos.get(a.id)!
          const h = assetHealth(a, state.gaps)
          const open = gapsOfAsset(a, state.gaps).filter(isOpen).length
          const dim = (matches && !matches(a)) || (selectedId && selectedId !== a.id && !neighbours.has(a.id))
          const type = ASSET_TYPE_BY_ID[a.type]
          return (
            <g
              key={a.id}
              className={`map-node map-node--${h} ${selectedId === a.id ? 'is-selected' : ''} ${dim ? 'is-dim' : ''} ${editable ? 'is-draggable' : ''}`}
              transform={`translate(${x} ${y})`}
              tabIndex={0}
              role="button"
              aria-label={`${a.name}, ${type.label}, ${HEALTH[h].label}${open ? `, ${open} lacune${open > 1 ? 's' : ''} ouverte${open > 1 ? 's' : ''}` : ''}`}
              aria-pressed={selectedId === a.id}
              onPointerDown={(e) => onNodeDown(e, p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(a.id)
                }
              }}
            >
              <title>{`${a.name}${a.role ? ` : ${a.role}` : ''}`}</title>
              <rect className="map-node__box" width={NODE_W} height={NODE_H} rx={10} />
              <rect className="map-node__bar" width={NODE_W} height={5} rx={2.5} />
              <g transform={`translate(${NODE_W / 2 - 14} 14) scale(1.17)`}>
                <path className="map-node__icon" d={type.icon} />
              </g>
              <text className="map-node__name" x={NODE_W / 2} y={60} textAnchor="middle">
                {short(a.name, 17)}
              </text>
              <text className="map-node__role" x={NODE_W / 2} y={75} textAnchor="middle">
                {short(type.label, 20)}
              </text>
              {open > 0 && (
                <g transform={`translate(${NODE_W - 6} 4)`}>
                  <circle className="map-node__badge" r={11} />
                  <text className="map-node__badge-text" textAnchor="middle" y={4}>
                    {open}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>
      <div className="map-footer">
        <p className="tiny muted">
          Molette pour zoomer, glisser le fond pour se déplacer{editable ? ', glisser un actif pour le réorganiser dans sa zone' : ''}.
        </p>
        <div className="map-controls" role="group" aria-label="Zoom">
          <button className="icon-btn" onClick={() => zoom(1 / 1.25)} aria-label="Zoomer">
            +
          </button>
          <button className="icon-btn" onClick={() => zoom(1.25)} aria-label="Dézoomer">
            −
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => setBox(full)}>
            Vue d’ensemble
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Vue liste (accessible, utile sur mobile)                            */
/* ------------------------------------------------------------------ */

function AssetList({ assets, selectedId, onSelect }: { assets: Asset[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const { state } = useCompliance()
  const [archived, setArchived] = useState(false)
  const rows = assets.filter((a) => archived || !a.archived)
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px' }}>
        <label className="toggle small">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Afficher les actifs archivés
        </label>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Actif</th>
              <th>Type</th>
              <th>Zone</th>
              <th>Criticité</th>
              <th>État</th>
              <th>Lacunes ouvertes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const h = assetHealth(a, state.gaps)
              return (
                <tr key={a.id} className={`${selectedId === a.id ? 'is-selected' : ''} ${a.archived ? 'is-archived' : ''}`}>
                  <td>
                    <button className="link-button" onClick={() => onSelect(a.id)}>
                      <strong>{a.name}</strong>
                    </button>
                    <div className="tiny muted">
                      {a.id}
                      {a.role && ` · ${a.role}`}
                      {a.archived && ' · Archivé'}
                    </div>
                  </td>
                  <td className="small nowrap">{ASSET_TYPE_BY_ID[a.type].label}</td>
                  <td className="small nowrap">{ZONE_BY_ID[a.zone].label}</td>
                  <td>
                    <CriticalityBadge value={a.criticality} />
                  </td>
                  <td className="small">
                    <Health tone={HEALTH[h].tone}>{HEALTH[h].label}</Health>
                  </td>
                  <td className="num">{gapsOfAsset(a, state.gaps).filter(isOpen).length}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Panneau de détail                                                   */
/* ------------------------------------------------------------------ */

function AssetPanel({ asset, onClose, onSelect }: { asset: Asset; onClose: () => void; onSelect: (id: string) => void }) {
  const { state, can, linkGapAsset, archiveAsset, restoreAsset, notify } = useCompliance()
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [toLink, setToLink] = useState('')
  const type = ASSET_TYPE_BY_ID[asset.type]
  const gaps = gapsOfAsset(asset, state.gaps)
  const h = assetHealth(asset, state.gaps)
  const gapIds = new Set(gaps.map((g) => g.id))
  const remediations = state.remediations.filter((r) => gapIds.has(r.gapId))
  const evidence = state.evidence.filter((e) => gapIds.has(e.gapId))
  const owner = state.users.find((u) => u.id === asset.owner)
  const linkable = state.gaps.filter((g) => !g.archived && !gapIds.has(g.id))
  const editable = can('edit') && !asset.archived

  const link = async (gapId: string, linked: boolean) => {
    const res = await linkGapAsset(gapId, asset.id, linked)
    if (!res.ok) return notify(res.error, 'error')
    notify(linked ? `${gapId} rattachée à ${asset.name}.` : `${gapId} détachée de ${asset.name}.`)
    setToLink('')
  }

  return (
    <aside className="card asset-panel" aria-label={`Détail de ${asset.name}`}>
      <div className="asset-panel__head">
        <span className={`asset-panel__icon asset-panel__icon--${h}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" width={22} height={22}>
            <path d={type.icon} />
          </svg>
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 className="asset-panel__title">{asset.name}</h2>
          <div className="tiny muted">
            {asset.id} · {type.label} · {ZONE_BY_ID[asset.zone].label}
          </div>
        </div>
        <button className="modal__close" onClick={onClose} aria-label="Fermer le détail">
          ×
        </button>
      </div>

      {asset.archived && <div className="banner banner--info">Actif archivé : il n’apparaît plus sur la carte.</div>}

      <div className="asset-panel__state">
        <Health tone={HEALTH[h].tone}>{HEALTH[h].label}</Health>
        <CriticalityBadge value={asset.criticality} />
      </div>

      <dl className="meta-list">
        {asset.role && (
          <div>
            <dt>Rôle</dt>
            <dd>{asset.role}</dd>
          </div>
        )}
        <div>
          <dt>Responsable</dt>
          <dd>{owner?.name ?? 'Non assigné'}</dd>
        </div>
        {asset.description && (
          <div>
            <dt>Description</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{asset.description}</dd>
          </div>
        )}
      </dl>

      <h3 className="asset-panel__section">
        Lacunes concernées <span className="count">{gaps.length}</span>
      </h3>
      {gaps.length ? (
        <ul className="asset-panel__list">
          {gaps.map((g) => (
            <li key={g.id}>
              <div className="asset-panel__row">
                <Link to={`/lacunes/${g.id}`} className="mono small">
                  {g.id}
                </Link>
                <CriticalityBadge value={g.criticality} />
                <StatusBadge value={g.status} />
                {editable && (
                  <button className="link-button tiny" onClick={() => void link(g.id, false)} aria-label={`Détacher ${g.id}`} title="Détacher de cet actif">
                    Détacher
                  </button>
                )}
              </div>
              <div className="small">{g.title}</div>
              <Progress value={gapProgress(g, state.remediations)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">Aucune lacune rattachée à cet actif.</p>
      )}
      {editable && linkable.length > 0 && (
        <div className="asset-panel__link">
          <label htmlFor="link-gap" className="sr-only">
            Rattacher une lacune
          </label>
          <select id="link-gap" className="input" value={toLink} onChange={(e) => setToLink(e.target.value)}>
            <option value="">Rattacher une lacune…</option>
            {linkable.map((g) => (
              <option key={g.id} value={g.id}>
                {g.id} : {short(g.title, 60)}
              </option>
            ))}
          </select>
          <button className="btn btn--secondary btn--sm" disabled={!toLink} onClick={() => void link(toLink, true)}>
            Rattacher
          </button>
        </div>
      )}

      <h3 className="asset-panel__section">
        Ce qui est mis en place <span className="count">{remediations.length}</span>
      </h3>
      {remediations.length ? (
        <ul className="asset-panel__list">
          {remediations.map((r) => (
            <li key={r.id}>
              <div className="asset-panel__row">
                <span className="mono tiny muted">{r.id}</span>
                <RemStatusBadge value={r.status} />
              </div>
              <div className="small">{r.title}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">Aucune remédiation pour l’instant.</p>
      )}
      <p className="small" style={{ marginTop: 8 }}>
        <Icon name="paperclip" /> {evidence.length} preuve{evidence.length > 1 ? 's' : ''} jointe{evidence.length > 1 ? 's' : ''} aux lacunes de cet actif.
      </p>

      <h3 className="asset-panel__section">
        Relié à <span className="count">{asset.links.length}</span>
      </h3>
      <div className="asset-panel__chips">
        {asset.links.map((id) => {
          const other = state.assets.find((a) => a.id === id)
          return other ? (
            <button key={id} className="chip chip--button" onClick={() => onSelect(id)}>
              {other.name}
            </button>
          ) : null
        })}
        {!asset.links.length && <span className="small muted">Aucune liaison.</span>}
      </div>

      {can('edit') && (
        <div className="form-actions">
          {asset.archived ? (
            <button
              className="btn btn--secondary"
              onClick={async () => {
                const r = await restoreAsset(asset.id)
                if (r.ok) notify('Actif restauré.')
                else notify(r.error, 'error')
              }}
            >
              Restaurer
            </button>
          ) : (
            <>
              <button className="btn btn--ghost" onClick={() => setArchiving(true)}>
                Archiver
              </button>
              <button className="btn btn--primary" onClick={() => setEditing(true)}>
                Modifier
              </button>
            </>
          )}
        </div>
      )}

      {editing && <AssetForm asset={asset} onClose={() => setEditing(false)} />}
      {archiving && (
        <ConfirmDialog
          title={`Archiver ${asset.name}`}
          message="L’actif disparaît de la carte mais reste dans l’historique et dans la vue Liste (actifs archivés). Les lacunes rattachées ne sont pas modifiées."
          confirmLabel="Archiver"
          tone="danger"
          onClose={() => setArchiving(false)}
          onConfirm={async () => {
            setArchiving(false)
            const r = await archiveAsset(asset.id)
            if (r.ok) notify('Actif archivé.')
            else notify(r.error, 'error')
          }}
        />
      )}
    </aside>
  )
}
