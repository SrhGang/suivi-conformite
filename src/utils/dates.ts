import type { ISODate } from '../types'

const DAY = 24 * 60 * 60 * 1000

/** Date ISO (AAAA-MM-JJ) en heure locale. */
export const toISODate = (d: Date | string | number): ISODate => {
  const date = new Date(d)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const today = (): ISODate => toISODate(new Date())

/** Parse une date AAAA-MM-JJ en minuit local (évite le décalage UTC). */
export const parseDate = (s: ISODate | Date): Date => {
  if (s instanceof Date) return new Date(s)
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (s: ISODate | Date, n: number): ISODate => {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export const addMonths = (s: ISODate | Date, n: number): ISODate => {
  const d = parseDate(s)
  d.setMonth(d.getMonth() + n)
  return toISODate(d)
}

/** Nombre de jours entre deux dates (a − b). */
export const diffDays = (a: ISODate, b: ISODate): number => Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / DAY)

/** Accepte une date AAAA-MM-JJ ou un horodatage ISO complet. */
export const formatDate = (s: string | null | undefined): string => {
  if (!s) return '-'
  const d = s.length > 10 ? new Date(s) : parseDate(s)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const formatDateTime = (s: string | null | undefined): string => {
  if (!s) return '-'
  return new Date(s).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const formatMonth = (s: ISODate): string =>
  parseDate(s).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })

/** Retourne le libellé relatif d'une échéance : « dans 5 j », « en retard de 3 j ». */
export const relativeDue = (s: ISODate | null | undefined, ref: ISODate = today()): string => {
  if (!s) return ''
  const n = diffDays(s, ref)
  if (n === 0) return "aujourd'hui"
  return n > 0 ? `dans ${n} j` : `en retard de ${-n} j`
}
