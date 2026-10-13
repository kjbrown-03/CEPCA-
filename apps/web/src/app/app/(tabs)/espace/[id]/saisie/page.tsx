'use client'

import { use, useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fmtInt, type AdminSeat } from '@cepca/shared'
import { api, errorMessage, idempotencyKey } from '@/lib/api'
import { staffKeys } from '../../../../_lib/staff'
import { SeatGate, can } from '../../../../_components/seat-gate'
import { Field } from '../../../../_components/form'
import { useToast } from '../../../../_components/toast'
import { BackHeader, Btn, Chip, ChipRow, Empty, ErrorState, FormError, Loading, Screen, Txt, color } from '../../../../_components/ui'

export default function ManualEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <SeatGate id={id} title="Saisie manuelle" fallback={`/app/espace/${id}`}>
      {(seat) => <ManualForm seat={seat} />}
    </SeatGate>
  )
}

/** Espèces ou virement reçus hors application : enregistrés comme réussis, avec reçu numéroté. */
function ManualForm({ seat }: { seat: AdminSeat }) {
  const router = useRouter()
  const qc = useQueryClient()
  const toast = useToast()
  const back = `/app/espace/${seat.assignmentId}`
  const writable = can(seat, 'CONTRIBUTIONS', 'write')
  const types = useQuery({
    queryKey: ['app', 'staff', 'types', seat.structure.id],
    queryFn: () => api.get<Array<{ key: string; label: string; requiresProject: boolean }>>('/admin/contribution-types', { structureId: seat.structure.id }),
    enabled: writable,
  })
  const [typeKey, setTypeKey] = useState('')
  const [amount, setAmount] = useState(0)
  const [channel, setChannel] = useState<'CASH' | 'BANK'>('CASH')
  const [payer, setPayer] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Un double appui n'enregistre pas deux fois la même somme
  const key = useRef(idempotencyKey())

  // Les dons à un projet se saisissent au back-office (choix du projet)
  const list = types.data?.filter((t) => !t.requiresProject) ?? []
  useEffect(() => {
    if (!typeKey && list.length) setTypeKey((list.find((t) => t.key === 'offrande') ?? list[0]).key)
  }, [typeKey, list])

  if (!writable)
    return (
      <Screen>
        <BackHeader title="Saisie manuelle" fallback={back} />
        <Empty>Votre rôle ne permet pas d’enregistrer des contributions.</Empty>
      </Screen>
    )

  const valid = !!typeKey && amount >= 100 && payer.trim().length >= 2

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      await api.post('/admin/contributions/manual', {
        idempotencyKey: key.current,
        structureId: seat.structure.id,
        typeKey,
        amount,
        channel,
        payerLabel: payer.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      void qc.invalidateQueries({ queryKey: staffKeys.dashboard(seat.assignmentId) })
      toast(`${fmtInt(amount)} FCFA enregistrés, reçu émis`)
      router.replace(back)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Screen gap={16}>
      <BackHeader title="Saisie manuelle" fallback={back} />
      <Txt size={13} color={color.textMuted} lh={1.5}>
        Espèces ou virement reçus pour {seat.structure.name}. La contribution est enregistrée comme réussie et un reçu est émis.
      </Txt>
      {types.isPending ? (
        <Loading minHeight={160} />
      ) : types.isError ? (
        <ErrorState error={types.error} onRetry={() => types.refetch()} />
      ) : (
        <form onSubmit={save} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="pwa-label">Type</span>
            <ChipRow>
              {list.map((t) => (
                <Chip key={t.key} label={t.label} weight={700} active={t.key === typeKey} onClick={() => setTypeKey(t.key)} />
              ))}
            </ChipRow>
          </div>
          <Field label="Montant (FCFA)">
            <input className="pwa-input" inputMode="numeric" value={amount ? fmtInt(amount) : ''} onChange={(e) => setAmount(Math.min(100_000_000, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)))} placeholder="0" style={{ fontSize: 22, fontWeight: 700 }} />
          </Field>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="pwa-label">Reçu en</span>
            <ChipRow>
              <Chip label="Espèces" active={channel === 'CASH'} onClick={() => setChannel('CASH')} />
              <Chip label="Virement" active={channel === 'BANK'} onClick={() => setChannel('BANK')} />
            </ChipRow>
          </div>
          <Field label="De la part de" hint="Nom du fidèle ou de la famille, tel qu’il figurera sur le reçu.">
            <input className="pwa-input" value={payer} onChange={(e) => setPayer(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Note (facultatif)">
            <input className="pwa-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ex. quête du culte de 10 h" />
          </Field>
          <FormError text={error} />
          <Btn type="submit" label={amount ? `Enregistrer ${fmtInt(amount)} FCFA` : 'Enregistrer'} loading={busy} disabled={!valid} />
        </form>
      )}
    </Screen>
  )
}
