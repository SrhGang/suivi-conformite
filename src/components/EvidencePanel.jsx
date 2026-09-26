import { useRef, useState } from 'react'
import { EVIDENCE_TYPES, EVIDENCE_TYPE_BY_ID } from '../data/constants.js'
import { IS_ARTIFACT } from '../platform.js'
import { useCompliance } from '../store/ComplianceContext.jsx'
import { formatDateTime } from '../utils/dates.js'
import Icon from './Icon.jsx'
import { ConfirmDialog, UserName } from './ui.jsx'

const MAX_INLINE = 1024 * 1024 // 1 Mo : au-delà, seules les métadonnées sont conservées localement.

const formatSize = (n) => {
  if (!n) return ''
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`
  return `${(n / 1024 / 1024).toFixed(1)} Mo`
}

const iconFor = (ev) => {
  if (ev.url) return 'link'
  const ext = ev.name.split('.').pop().toLowerCase()
  if (['csv', 'xlsx', 'xls'].includes(ext)) return 'table'
  return 'file'
}

const guessType = (name) => {
  const ext = name.split('.').pop().toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'capture'
  if (['csv', 'log', 'txt', 'json'].includes(ext)) return 'journal'
  return 'autre'
}

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

export default function EvidencePanel({ gap }) {
  const { state, can, addEvidence, removeEvidence, notify } = useCompliance()
  const evidence = state.evidence.filter((e) => e.gapId === gap.id)
  const [over, setOver] = useState(false)
  const [type, setType] = useState('')
  const [link, setLink] = useState({ name: '', url: '' })
  const [removing, setRemoving] = useState(null)
  const fileRef = useRef(null)
  const editable = can('edit') && !gap.archived

  const upload = async (files) => {
    for (const file of Array.from(files)) {
      const dataUrl = file.size <= MAX_INLINE ? await readAsDataUrl(file) : null
      const res = addEvidence(gap.id, { name: file.name, size: file.size, type: type || guessType(file.name), dataUrl })
      if (res.error) notify(res.error, 'error')
      else notify(dataUrl ? `Preuve « ${file.name} » ajoutée.` : `« ${file.name} » référencée (fichier > 1 Mo : contenu non stocké dans le prototype).`, dataUrl ? 'success' : 'warning')
    }
  }

  const addLink = (e) => {
    e.preventDefault()
    if (!/^https?:\/\//i.test(link.url.trim())) {
      notify('Le lien doit commencer par http:// ou https://', 'error')
      return
    }
    const res = addEvidence(gap.id, { name: link.name || link.url, url: link.url, type: type || 'autre' })
    if (res.error) notify(res.error, 'error')
    else {
      notify('Lien de preuve ajouté.')
      setLink({ name: '', url: '' })
    }
  }

  return (
    <div>
      {evidence.length === 0 ? (
        <p className="small muted" style={{ marginBottom: 16 }}>
          Aucune preuve jointe. Au moins une preuve est requise pour valider la lacune.
        </p>
      ) : (
        <ul className="evidence-list">
          {evidence.map((ev) => (
            <li key={ev.id}>
              <span className="icon" aria-hidden="true">
                <Icon name={iconFor(ev)} size={20} />
              </span>
              <div className="body">
                <div className="name">{ev.name}</div>
                <div className="tiny muted">
                  {EVIDENCE_TYPE_BY_ID[ev.type]?.label} {ev.size ? `· ${formatSize(ev.size)}` : ''} · {formatDateTime(ev.uploadedAt)} · <UserName id={ev.uploadedBy} />
                </div>
              </div>
              {ev.url ? (
                <a className="btn btn--ghost btn--sm" href={ev.url} target="_blank" rel="noopener noreferrer">
                  Ouvrir
                </a>
              ) : ev.dataUrl && !IS_ARTIFACT ? (
                <a className="btn btn--ghost btn--sm" href={ev.dataUrl} download={ev.name}>
                  Télécharger
                </a>
              ) : (
                <span className="tiny muted" title={ev.dataUrl ? 'Fichier conservé dans ce navigateur.' : 'Fichier de démonstration ou trop volumineux : seules les métadonnées sont conservées.'}>
                  {ev.dataUrl ? 'stocké localement' : 'métadonnées'}
                </span>
              )}
              {editable && (
                <button className="btn btn--danger btn--sm" onClick={() => setRemoving(ev)} aria-label={`Retirer ${ev.name}`}>
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <>
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="ev-type">Type de preuve</label>
            <select id="ev-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Détection automatique</option>
              {EVIDENCE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div
            className={`dropzone ${over ? 'is-over' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              upload(e.dataTransfer.files)
            }}
          >
            <Icon name="paperclip" size={24} />
            <strong>Déposez un fichier ici</strong> ou cliquez pour parcourir
            <div className="tiny">Capture, certificat, rapport d’audit, extrait de journal… (≤ 1 Mo stocké localement)</div>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
          </div>
          <form onSubmit={addLink} className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
            <input className="input" style={{ flex: '1 1 180px' }} placeholder="Libellé du lien" value={link.name} onChange={(e) => setLink((l) => ({ ...l, name: e.target.value }))} aria-label="Libellé du lien" />
            <input className="input" style={{ flex: '2 1 260px' }} type="url" placeholder="https://… (wiki, GED, ticket)" value={link.url} onChange={(e) => setLink((l) => ({ ...l, url: e.target.value }))} aria-label="URL de la preuve" />
            <button className="btn btn--secondary" type="submit" disabled={!link.url}>
              + Ajouter le lien
            </button>
          </form>
        </>
      )}

      {removing && (
        <ConfirmDialog
          title="Retirer la preuve"
          message={`Retirer « ${removing.name} » ? L'opération est tracée dans l'historique.`}
          confirmLabel="Retirer"
          tone="accent"
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            const r = removeEvidence(removing.id)
            r.error ? notify(r.error, 'error') : notify('Preuve retirée.')
            setRemoving(null)
          }}
        />
      )}
    </div>
  )
}
