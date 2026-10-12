/**
 * Registre des actions métier exposées par l'API. Chaque action valide
 * strictement ses arguments (zod) avant d'appeler la fonction pure partagée
 * avec le frontend (src/store/actions.ts) : un champ inattendu est refusé,
 * ce qui empêche par exemple de modifier `status` ou `archived` via
 * « updateGap ».
 */
import { z } from 'zod'
import * as A from '../../src/store/actions'
import type { ActionResult, ComplianceState, User } from '../../src/types'

const id = z.string().min(1).max(40)
const text = (max: number) => z.string().max(max)
/** Argument facultatif : JSON transforme `undefined` en `null` dans un tableau. */
const opt = <T extends z.ZodType>(schema: T) => schema.nullish().transform((v) => v ?? undefined)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')

const criticality = z.enum(['critique', 'haute', 'moyenne', 'basse'])
const gapStatus = z.enum(['non_traitee', 'en_cours', 'corrigee', 'validee'])
const remType = z.enum(['bonne_pratique', 'outil', 'automatisation', 'procedure', 'formation'])
const remStatus = z.enum(['a_faire', 'en_cours', 'bloque', 'valide'])
const evidenceType = z.enum(['capture', 'certificat', 'rapport', 'procedure', 'journal', 'autre'])
const nis2 = z.enum(['20', '21.2.a', '21.2.b', '21.2.c', '21.2.d', '21.2.e', '21.2.f', '21.2.g', '21.2.h', '21.2.i', '21.2.j', '23'])
const controlId = z.string().regex(/^[5-8]\.\d{1,2}$/, 'Mesure ISO invalide')

const gapInput = z
  .object({
    title: text(300),
    description: text(5000).optional(),
    controlIds: z.array(controlId).max(20),
    nis2Refs: z.array(nis2).max(12).optional(),
    anssiRef: text(500).optional(),
    criticality,
    impact: text(2000).optional(),
    dueDate: isoDate,
    assignee: id.optional(),
  })
  .strict()

const remediationInput = z
  .object({
    title: text(300),
    type: remType,
    status: remStatus.optional(),
    progress: z.number().min(0).max(100).optional(),
    startDate: isoDate.optional(),
    targetDate: isoDate,
    owner: id.optional(),
    description: text(5000).optional(),
  })
  .strict()

// Les liens sont les seules preuves créées par cette voie ; les fichiers passent par l'envoi dédié.
const evidenceLinkInput = z
  .object({
    name: text(300),
    type: evidenceType.optional(),
    url: z.string().url().max(2000).refine((u) => /^https?:\/\//i.test(u), 'Lien http(s) attendu'),
  })
  .strict()

const milestone = z.object({ id, date: isoDate, label: text(200), target: z.number().min(0).max(100) }).strict()

type Handler = (state: ComplianceState, user: User, args: unknown[]) => ActionResult

/** Associe un schéma d'arguments (tuple) à une action pure. */
function action<S extends z.ZodTuple>(schema: S, fn: (state: ComplianceState, user: User, ...args: z.infer<S>) => ActionResult): Handler {
  return (state, user, args) => {
    const parsed = schema.safeParse(args)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return { ok: false, error: `Données invalides${issue ? ` (${issue.path.join('.') || 'arguments'} : ${issue.message})` : ''}.` }
    }
    return fn(state, user, ...(parsed.data as z.infer<S>))
  }
}

export const ACTIONS: Record<string, Handler> = {
  createGap: action(z.tuple([gapInput]), A.createGap),
  updateGap: action(z.tuple([id, gapInput.partial()]), A.updateGap),
  changeGapStatus: action(z.tuple([id, gapStatus, opt(text(2000))]), A.changeGapStatus),
  duplicateGap: action(z.tuple([id]), A.duplicateGap),
  confirmGap: action(z.tuple([id]), A.confirmGap),
  archiveGap: action(z.tuple([id, opt(text(2000))]), (s, u, gapId, reason) => A.setArchived(s, u, gapId, true, reason)),
  restoreGap: action(z.tuple([id]), (s, u, gapId) => A.setArchived(s, u, gapId, false)),
  performReview: action(z.tuple([id, z.enum(['conforme', 'non_conforme']), opt(text(2000))]), A.performReview),
  addRemediation: action(z.tuple([id, remediationInput]), A.addRemediation),
  updateRemediation: action(z.tuple([id, remediationInput.partial()]), A.updateRemediation),
  deleteRemediation: action(z.tuple([id]), A.deleteRemediation),
  addEvidence: action(z.tuple([id, evidenceLinkInput]), A.addEvidence),
  removeEvidence: action(z.tuple([id]), A.removeEvidence),
  updateMilestones: action(z.tuple([z.array(milestone).max(20)]), A.updateMilestones),
}

export type ActionName = keyof typeof ACTIONS
