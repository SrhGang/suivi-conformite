import { useMemo, useState, type ChangeEvent } from 'react'
import { ASSET_TYPE_BY_ID, ZONE_BY_ID } from '../data/assets'
import { useCompliance } from '../store/ComplianceContext'
import { assetCsvTemplate, previewAssetImport } from '../utils/assetCsv'
import { download } from '../utils/report'
import { Modal } from './ui'

const ACTION_LABEL = { create: 'Création', update: 'Mise à jour', skip: 'Ignoré (déjà présent)' } as const

/** Import d'actifs depuis un fichier CSV, avec aperçu avant validation. */
export default function AssetImport({ onClose }: { onClose: () => void }) {
  const { state, importAssets, notify } = useCompliance()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [updateExisting, setUpdateExisting] = useState(false)
  const [busy, setBusy] = useState(false)

  const preview = useMemo(
    () => (text.trim() ? previewAssetImport(text, state.users, state.assets, updateExisting) : null),
    [text, state.users, state.assets, updateExisting],
  )
  const valid = preview?.rows.filter((r) => r.item) ?? []
  const errors = preview?.rows.filter((r) => r.error) ?? []
  const effective = valid.filter((r) => r.action !== 'skip')

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return notify('Fichier trop volumineux (2 Mo au maximum).', 'error')
    setFileName(file.name)
    setText(await file.text())
  }

  const submit = async () => {
    if (busy || errors.length || !effective.length) return
    setBusy(true)
    const res = await importAssets(
      valid.map((r) => r.item!),
      updateExisting,
    )
    setBusy(false)
    if (!res.ok) return notify(res.error, 'error')
    const { created, updated, unresolvedLinks } = res.result
    notify(
      `Import terminé : ${created} actif${created > 1 ? 's' : ''} créé${created > 1 ? 's' : ''}, ${updated} mis à jour.` +
        (unresolvedLinks.length ? ` Liaisons introuvables : ${unresolvedLinks.join(', ')}.` : ''),
      unresolvedLinks.length ? 'warning' : 'success',
    )
    onClose()
  }

  return (
    <Modal title="Importer des actifs (CSV)" onClose={onClose}>
      <p className="small" style={{ marginBottom: 12 }}>
        Une ligne par actif. Colonnes : <span className="mono tiny">Nom ; Type ; Rôle ; Zone ; Criticité ; Responsable ; Description ; Relié à</span>. Nom,
        Type et Zone sont obligatoires ; les liaisons sont des noms d’actifs séparés par « | ».{' '}
        <button type="button" className="link-button" onClick={() => download('modele-actifs.csv', assetCsvTemplate(), 'text/csv;charset=utf-8')}>
          Télécharger le modèle CSV
        </button>
      </p>

      <div className="field">
        <label htmlFor="import-file">Fichier CSV</label>
        <input id="import-file" className="input" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void onFile(e)} />
        {fileName && <span className="hint">{fileName}</span>}
      </div>
      <details className="small" style={{ marginBottom: 12 }}>
        <summary>Ou coller le contenu</summary>
        <textarea
          className="input mono tiny"
          rows={5}
          aria-label="Contenu CSV"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setFileName('')
          }}
          placeholder={'Nom;Type;Zone\nPare-feu;parefeu;dmz'}
          style={{ marginTop: 6 }}
        />
      </details>

      <label className="toggle small" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} /> Mettre à jour les actifs qui existent
        déjà (même nom) ; sinon ils sont ignorés
      </label>

      {preview?.fatal && (
        <div className="banner banner--error" role="alert">
          {preview.fatal}
        </div>
      )}

      {preview && !preview.fatal && (
        <>
          <p className="small" role="status">
            <strong>{valid.filter((r) => r.action === 'create').length}</strong> création(s), <strong>{valid.filter((r) => r.action === 'update').length}</strong>{' '}
            mise(s) à jour, <strong>{valid.filter((r) => r.action === 'skip').length}</strong> ignorée(s),{' '}
            <strong className={errors.length ? 'text-error' : ''}>{errors.length}</strong> erreur(s).
            {errors.length > 0 && ' Corrigez le fichier : rien n’est importé tant qu’il reste une erreur.'}
          </p>
          <div className="table-wrap import-preview">
            <table className="table">
              <thead>
                <tr>
                  <th>Ligne</th>
                  <th>Actif</th>
                  <th>Type</th>
                  <th>Zone</th>
                  <th>Effet</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className={r.error ? 'is-error' : r.action === 'skip' ? 'is-archived' : ''}>
                    <td className="num">{r.line}</td>
                    {r.item ? (
                      <>
                        <td>
                          <strong>{r.item.name}</strong>
                          {r.item.links.length > 0 && <div className="tiny muted">Relié à : {r.item.links.join(', ')}</div>}
                        </td>
                        <td className="small nowrap">{ASSET_TYPE_BY_ID[r.item.type].label}</td>
                        <td className="small nowrap">{ZONE_BY_ID[r.item.zone].label}</td>
                        <td className="small nowrap">{ACTION_LABEL[r.action!]}</td>
                      </>
                    ) : (
                      <td colSpan={4} className="small text-error">
                        {r.error}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Annuler
        </button>
        <button type="button" className="btn btn--primary" disabled={busy || !preview || !!preview.fatal || errors.length > 0 || !effective.length} onClick={() => void submit()}>
          {effective.length ? `Importer ${effective.length} actif${effective.length > 1 ? 's' : ''}` : 'Importer'}
        </button>
      </div>
    </Modal>
  )
}
