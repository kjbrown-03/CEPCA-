import PDFDocument from 'pdfkit'
import { CHANNEL_LABEL, dayMonthYear, fcfaToEur, fmtFcfa, maskPhone, timeIn } from '@cepca/shared'

export interface ReceiptData {
  receiptNumber: string
  confessionName: string
  payerName: string
  payerPhone: string | null
  type: string
  destination: string
  amount: number
  fee: number
  totalCharged: number
  channel: string
  providerRef: string | null
  confirmedAt: Date
  refunded: boolean
}

// Les polices standard du PDF sont en WinAnsi : l'espace fine insécable des milliers n'y existe pas.
const ascii = (s: string) => s.replace(/[  ]/g, ' ')

/** Reçu A5 généré à la demande. Jamais stocké derrière une URL publique. */
export function renderReceipt(d: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 40, info: { Title: `Reçu ${d.receiptNumber}`, Author: 'CEPCA Digital' } })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const green = '#1f5a36'
    const muted = '#55665a'
    const w = doc.page.width - 80

    doc.rect(0, 0, doc.page.width, 70).fill('#133524')
    doc.fillColor('#f4efe6').font('Helvetica-Bold').fontSize(16).text('CEPCA Digital', 40, 22)
    doc.font('Helvetica').fontSize(9).fillColor('#a9c4b2').text(ascii(d.confessionName), 40, 44)

    doc.moveDown(3).fillColor(green).font('Helvetica-Bold').fontSize(13).text(d.refunded ? 'Reçu de contribution (remboursée)' : 'Reçu de contribution', 40, 92)
    doc.font('Helvetica').fontSize(9).fillColor(muted).text(`N° ${d.receiptNumber}`)

    doc.moveDown(1.2).fillColor('#1c2a21').font('Helvetica-Bold').fontSize(22).text(ascii(fmtFcfa(d.amount)))
    doc.font('Helvetica').fontSize(9).fillColor(muted).text(`soit ${fcfaToEur(d.amount)} € (1 € = 655,957 FCFA)`)

    const rows: Array<[string, string]> = [
      ['Date', `${dayMonthYear(d.confirmedAt)} à ${timeIn(d.confirmedAt)} (Douala)`],
      ['Fidèle', d.payerName],
      ['Type', d.type],
      ['Destination', d.destination],
      ['Moyen de paiement', CHANNEL_LABEL[d.channel] ?? d.channel],
      ['Numéro payeur', d.payerPhone ? maskPhone(d.payerPhone) : '—'],
      ['Référence opérateur', d.providerRef ?? '—'],
      ['Frais opérateur', fmtFcfa(d.fee)],
      ['Total débité', fmtFcfa(d.totalCharged)],
    ]
    let y = doc.y + 18
    for (const [k, v] of rows) {
      doc.moveTo(40, y - 6).lineTo(40 + w, y - 6).lineWidth(0.5).strokeColor('#e6dfd0').stroke()
      doc.font('Helvetica').fontSize(9).fillColor(muted).text(k, 40, y, { width: w / 2 - 6 })
      doc.font('Helvetica-Bold').fillColor('#1c2a21').text(ascii(v), 40 + w / 2, y, { width: w / 2, align: 'right' })
      y = Math.max(doc.y, y + 12) + 10
    }

    doc.font('Helvetica').fontSize(8).fillColor(muted).text(
      'Ce reçu atteste un paiement confirmé par l’opérateur de Mobile Money. Il ne constitue pas une pièce comptable de la structure bénéficiaire.',
      40,
      doc.page.height - 80,
      { width: w, align: 'center' },
    )
    doc.end()
  })
}
