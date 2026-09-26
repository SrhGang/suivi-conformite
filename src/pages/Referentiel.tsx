import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { CriticalityBadge, Progress, StatusBadge } from '../components/ui'
import { ISO_CONTROLS, NIS2_REQUIREMENTS, THEMES } from '../data/isoControls'
import { useCompliance } from '../store/ComplianceContext'
import { activeGaps, isOpen } from '../utils/compliance'
import { applyParamChanges } from '../utils/searchParams'
import type { Gap } from '../types'

type ControlState = 'open' | 'validated' | 'none'

/**
 * Référentiel ISO 27001:2022 (93 mesures) relié aux exigences NIS2,
 * avec l'état de conformité déduit des lacunes ouvertes.
 */
export default function Referentiel() {
  const { state } = useCompliance()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const theme = params.get('theme') ?? ''
  const etat = params.get('etat') ?? ''
  const focus = params.get('mesure')

  const gapsByControl = useMemo(() => {
    const map = new Map<string, Gap[]>()
    for (const g of activeGaps(state.gaps))
      for (const c of g.controlIds) map.set(c, [...(map.get(c) ?? []), g])
    return map
  }, [state.gaps])

  const controlState = (id: string): ControlState => {
    const gaps = gapsByControl.get(id) ?? []
    if (gaps.some(isOpen)) return 'open'
    return gaps.length ? 'validated' : 'none'
  }

  const nis2Coverage = useMemo(
    () =>
      NIS2_REQUIREMENTS.map((n) => {
        const controls = ISO_CONTROLS.filter((c) => c.nis2.includes(n.id))
        const openControls = controls.filter((c) => (gapsByControl.get(c.id) ?? []).some(isOpen))
        const openGaps = activeGaps(state.gaps).filter((g) => isOpen(g) && g.nis2Refs.includes(n.id))
        return {
          ...n,
          total: controls.length,
          conform: controls.length - openControls.length,
          openGaps: openGaps.length,
        }
      }),
    [gapsByControl, state.gaps],
  )

  useEffect(() => {
    if (focus) document.getElementById(`ctrl-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus])

  const setParam = (key: string, value: string) => {
    const next = applyParamChanges(params, { [key]: value, mesure: null })
    setParams(next, { replace: true })
  }

  const nq = q.trim().toLowerCase()
  const shown = ISO_CONTROLS.filter(
    (c) =>
      (!theme || c.theme === theme) &&
      (!etat || (etat === 'open' ? controlState(c.id) === 'open' : controlState(c.id) !== 'open')) &&
      (!nq || c.id.includes(nq) || c.title.toLowerCase().includes(nq)),
  )
  const openCount = ISO_CONTROLS.filter((c) => controlState(c.id) === 'open').length

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Référentiel ISO 27001:2022 ↔ NIS2</h1>
          <p className="page-head__sub">
            93 mesures de l’annexe A · {ISO_CONTROLS.length - openCount} sans lacune ouverte · {openCount} avec au moins une lacune ouverte
          </p>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 24 }}>
        <div className="card__head">
          <h3 className="card__title">Couverture des exigences NIS2 (art. 20, 21.2 et 23)</h3>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Exigence</th>
                <th>Mesures ISO liées</th>
                <th>Conformité des mesures</th>
                <th>Lacunes ouvertes</th>
              </tr>
            </thead>
            <tbody>
              {nis2Coverage.map((n) => (
                <tr key={n.id}>
                  <td title={n.description}>
                    <strong style={{ color: 'var(--text-title)' }}>{n.label}</strong>
                    <div className="tiny muted">{n.description}</div>
                  </td>
                  <td className="num">{n.total}</td>
                  <td style={{ minWidth: 180 }}>
                    <Progress value={n.total ? Math.round((n.conform / n.total) * 100) : 100} />
                  </td>
                  <td className="num">
                    {n.openGaps ? (
                      <Link to={`/lacunes?nis2=${encodeURIComponent(n.id)}&statut=ouvertes`}>{n.openGaps}</Link>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ marginTop: 12 }}>
          Correspondance indicative ISO 27001 ↔ NIS2, à confirmer au regard du référentiel publié par l’ANSSI pour la transposition française.
        </p>
      </section>

      <div className="toolbar">
        <div className="search">
          <input className="input" type="search" placeholder="Chercher une mesure (8.13, sauvegarde…)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Chercher une mesure" />
        </div>
        <select className="input" value={theme} onChange={(e) => setParam('theme', e.target.value)} aria-label="Thème">
          <option value="">Tous les thèmes</option>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} {t.label}
            </option>
          ))}
        </select>
        <select className="input" value={etat} onChange={(e) => setParam('etat', e.target.value)} aria-label="État">
          <option value="">Toutes les mesures</option>
          <option value="open">Avec lacune ouverte</option>
          <option value="ok">Sans lacune ouverte</option>
        </select>
      </div>

      {THEMES.filter((t) => shown.some((c) => c.theme === t.id)).map((t) => {
        const list = shown.filter((c) => c.theme === t.id)
        return (
          <section key={t.id} style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 12 }}>
              {t.code} — {t.label} <span className="small muted">({list.length})</span>
            </h3>
            <div className="control-grid">
              {list.map((c) => {
                const st = controlState(c.id)
                const gaps = gapsByControl.get(c.id) ?? []
                return (
                  <div key={c.id} id={`ctrl-${c.id}`} className={`control-item ${st === 'open' ? 'is-open' : st === 'validated' ? 'is-ok' : ''}`} style={focus === c.id ? { boxShadow: '0 0 0 3px var(--primary-500)' } : undefined}>
                    <span className="control-item__id">{c.id}</span>
                    <div className="control-item__body">
                      <div style={{ fontWeight: 600, color: 'var(--text-title)' }}>{c.title}</div>
                      <div className="tiny muted">NIS2 : {c.nis2.join(', ')}</div>
                      {gaps.length > 0 && (
                        <ul style={{ margin: '6px 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {gaps.map((g) => (
                            <li key={g.id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <Link to={`/lacunes/${g.id}`} className="mono tiny">
                                {g.id}
                              </Link>
                              <CriticalityBadge value={g.criticality} />
                              <StatusBadge value={g.status} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <span className="tiny" title={st === 'open' ? 'Lacune ouverte' : st === 'validated' ? 'Lacune(s) corrigée(s) et validée(s)' : 'Aucune lacune identifiée'}>
                      {st === 'open' ? <Icon name="x" /> : <Icon name="check" />}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
      {!shown.length && <p className="muted">Aucune mesure ne correspond.</p>}
    </div>
  )
}
