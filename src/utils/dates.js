const DAY = 24 * 60 * 60 * 1000

/** Date ISO (AAAA-MM-JJ) en heure locale. */
export const toISODate = (d) => {
  const date = new Date(d)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const today = () => toISODate(new Date())

/** Parse une date AAAA-MM-JJ en minuit local (évite le décalage UTC). */
export const parseDate = (s) => {
  if (!s) return null
  if (s instanceof Date) return s
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (s, n) => {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export const addMonths = (s, n) => {
  const d = parseDate(s)
  d.setMonth(d.getMonth() + n)
  return toISODate(d)
}

export const diffDays = (a, b) => Math.round((parseDate(a) - parseDate(b)) / DAY)

export const formatDate = (s) => {
  if (!s) return '—'
  const d = s.length > 10 ? new Date(s) : parseDate(s)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const formatDateTime = (s) => {
  if (!s) return '—'
  return new Date(s).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const formatMonth = (s) =>
  parseDate(s).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })

/** Retourne le libellé relatif d'une échéance : « dans 5 j », « en retard de 3 j ». */
export const relativeDue = (s, ref = today()) => {
  if (!s) return ''
  const n = diffDays(s, ref)
  if (n === 0) return "aujourd'hui"
  return n > 0 ? `dans ${n} j` : `en retard de ${-n} j`
}
