import { useEffect, useRef, useState } from 'react'
import { EXPORT_EVENT } from '../utils/report.js'
import { Modal } from './ui.jsx'

/**
 * Page hébergée : les téléchargements sont bloqués, le contenu exporté
 * est donc affiché ici pour être copié (rapport, CSV, sauvegarde JSON).
 */
export default function ExportDialog() {
  const [file, setFile] = useState(null)
  const [copied, setCopied] = useState(false)
  const areaRef = useRef(null)

  useEffect(() => {
    const onExport = (e) => {
      setCopied(false)
      setFile(e.detail)
    }
    window.addEventListener(EXPORT_EVENT, onExport)
    return () => window.removeEventListener(EXPORT_EVENT, onExport)
  }, [])

  if (!file) return null
  const isHtml = file.mime.startsWith('text/html')
  const content = file.content.replace(/^﻿/, '')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
    } catch {
      areaRef.current?.focus()
      areaRef.current?.select()
    }
  }

  return (
    <Modal title={`Export — ${file.filename}`} onClose={() => setFile(null)}>
      <p className="small" style={{ marginBottom: 12 }}>
        Le téléchargement n'est pas disponible dans la version en ligne. Copiez le contenu puis collez-le dans un fichier nommé <strong className="mono">{file.filename}</strong>.
      </p>
      {isHtml && (
        <iframe
          title="Aperçu du rapport"
          srcDoc={content}
          sandbox=""
          style={{ width: '100%', height: 360, border: '1px solid var(--neutral-200)', borderRadius: 8, marginBottom: 12, background: 'white' }}
        />
      )}
      <label htmlFor="export-content" className="sr-only">
        Contenu exporté
      </label>
      <textarea id="export-content" ref={areaRef} className="input mono" readOnly rows={isHtml ? 5 : 12} value={content} style={{ fontSize: '0.75rem' }} />
      <div className="form-actions">
        <button className="btn btn--secondary" onClick={() => setFile(null)}>
          Fermer
        </button>
        <button className="btn btn--primary" onClick={copy}>
          {copied ? 'Copié' : 'Copier le contenu'}
        </button>
      </div>
    </Modal>
  )
}
