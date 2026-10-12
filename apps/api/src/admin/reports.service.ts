import { Injectable } from '@nestjs/common'
import PDFDocument from 'pdfkit'
import { fmtFcfa, fmtInt, fmtMillions, fmtPct, pct, type ReportDto } from '@cepca/shared'
import { PrismaService } from '../prisma/prisma.service'
import { parsePeriod } from './period'

type Node = { id: string; name: string; path: string }
const TITLES = { contributions: 'Contributions', members: 'Fidèles', projects: 'Projets', activities: 'Activités', communication: 'Activité et audience' } as const
export type ReportType = keyof typeof TITLES

const evolution = (now: number, before: number) => (before > 0 ? `${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 100)} %` : now > 0 ? 'nouveau' : '—')

/**
 * Rapports agrégés (§35) : une ligne par sous-structure, jamais de ligne nominative.
 * C'est la seule vue des contributions accessible à un droit agrégé (CEPCA).
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(type: ReportType, period: string, scope: Node): Promise<ReportDto> {
    const range = parsePeriod(period)
    const span = range.to.getTime() - range.from.getTime()
    const prev = { from: new Date(range.from.getTime() - span), to: range.from }
    const kids = await this.prisma.structure.findMany({ where: { parentId: scope.id }, select: { id: true, name: true, path: true }, orderBy: { name: 'asc' } })
    const nodes: Node[] = kids.length ? kids : [scope]
    const under = (n: Node) => ({ path: { startsWith: n.path } })
    let kpis: Array<[string, string]> = []
    let columns: string[] = []
    let rows: string[][] = []

    if (type === 'contributions') {
      columns = ['Structure', 'Montant (FCFA)', 'Transactions', 'Taux de réussite', 'Évolution']
      let total = 0
      let count = 0
      let ok = 0
      let ko = 0
      rows = await Promise.all(
        nodes.map(async (n) => {
          const [cur, before, failed] = await Promise.all([
            this.prisma.contribution.aggregate({ where: { structure: under(n), status: { in: ['SUCCEEDED', 'REFUNDED'] }, confirmedAt: { gte: range.from, lt: range.to } }, _sum: { amount: true }, _count: true }),
            this.prisma.contribution.aggregate({ where: { structure: under(n), status: { in: ['SUCCEEDED', 'REFUNDED'] }, confirmedAt: { gte: prev.from, lt: prev.to } }, _sum: { amount: true } }),
            this.prisma.contribution.count({ where: { structure: under(n), status: { in: ['FAILED', 'CANCELLED'] }, createdAt: { gte: range.from, lt: range.to } } }),
          ])
          const amount = cur._sum.amount ?? 0
          total += amount
          count += cur._count
          ok += cur._count
          ko += failed
          return [n.name, fmtInt(amount), fmtInt(cur._count), cur._count + failed ? fmtPct((cur._count / (cur._count + failed)) * 100) : '—', evolution(amount, before._sum.amount ?? 0)]
        }),
      )
      kpis = [['Collecté', fmtFcfa(total)], ['Transactions', fmtInt(count)], ['Taux de réussite', ok + ko ? fmtPct((ok / (ok + ko)) * 100) : '—']]
    }

    if (type === 'members') {
      columns = ['Structure', 'Fidèles', 'Nouveaux', 'Diaspora', 'En attente']
      let total = 0
      let fresh = 0
      let dia = 0
      rows = await Promise.all(
        nodes.map(async (n) => {
          const [active, created, diaspora, pending] = await Promise.all([
            this.prisma.membership.count({ where: { structure: under(n), status: 'ACTIVE' } }),
            this.prisma.membership.count({ where: { structure: under(n), status: 'ACTIVE', validatedAt: { gte: range.from, lt: range.to } } }),
            this.prisma.membership.count({ where: { structure: under(n), status: 'ACTIVE', user: { residence: 'DIASPORA' } } }),
            this.prisma.membership.count({ where: { structure: under(n), status: 'PENDING' } }),
          ])
          total += active
          fresh += created
          dia += diaspora
          return [n.name, fmtInt(active), fmtInt(created), fmtInt(diaspora), fmtInt(pending)]
        }),
      )
      kpis = [['Fidèles inscrits', fmtInt(total)], ['Nouveaux', fmtInt(fresh)], ['Diaspora', fmtInt(dia)]]
    }

    if (type === 'projects') {
      columns = ['Projet', 'Structure', 'Budget (FCFA)', 'Mobilisé (FCFA)', 'Avancement', 'Statut']
      const ps = await this.prisma.project.findMany({ where: { structure: under(scope), status: { notIn: ['IDEA'] } }, include: { structure: { select: { name: true } } }, orderBy: { raisedAmount: 'desc' }, take: 500 })
      rows = ps.map((p) => [p.title, p.structure.name, p.budget ? fmtMillions(p.budget) : '—', fmtMillions(p.raisedAmount), p.goalAmount ? fmtPct(pct(p.raisedAmount, p.goalAmount)) : '—', p.status])
      const active = ps.filter((p) => ['VALIDATED', 'FUNDING', 'EXECUTION'].includes(p.status))
      kpis = [['Projets actifs', fmtInt(active.length)], ['Mobilisé', fmtFcfa(ps.reduce((s, p) => s + p.raisedAmount, 0))], ['Achevés', fmtInt(ps.filter((p) => p.status === 'COMPLETED').length)]]
    }

    if (type === 'activities') {
      columns = ['Activité', 'Structure', 'Date', 'Inscrits', 'Capacité', 'Taux de participation']
      const evs = await this.prisma.event.findMany({
        where: { structure: under(scope), status: 'PUBLISHED', startsAt: { gte: range.from, lt: range.to } },
        include: { structure: { select: { name: true } }, _count: { select: { registrations: { where: { cancelledAt: null } } } } },
        orderBy: { startsAt: 'asc' },
        take: 500,
      })
      const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Africa/Douala' })
      rows = evs.map((e) => [e.title, e.structure.name, fmt.format(e.startsAt), fmtInt(e._count.registrations), e.capacity ? fmtInt(e.capacity) : '—', e.capacity ? fmtPct((e._count.registrations / e.capacity) * 100) : '—'])
      const withCap = evs.filter((e) => e.capacity)
      const rate = withCap.length ? withCap.reduce((s, e) => s + e._count.registrations / e.capacity!, 0) / withCap.length : null
      kpis = [['Activités', fmtInt(evs.length)], ['Inscriptions', fmtInt(evs.reduce((s, e) => s + e._count.registrations, 0))], ['Participation moyenne', rate === null ? '—' : fmtPct(rate * 100)]]
    }

    if (type === 'communication') {
      columns = ['Structure', 'Publications', 'Lectures', 'Écoutes', 'Notifications']
      let pubs = 0
      let reads = 0
      let plays = 0
      rows = await Promise.all(
        nodes.map(async (n) => {
          const [p, s, c] = await Promise.all([
            this.prisma.publication.aggregate({ where: { target: under(n), status: { in: ['PUBLISHED', 'ARCHIVED'] }, publishedAt: { gte: range.from, lt: range.to } }, _count: true, _sum: { readCount: true } }),
            this.prisma.spiritualContent.aggregate({ where: { structure: under(n), status: 'PUBLISHED', publishedAt: { gte: range.from, lt: range.to } }, _sum: { playCount: true } }),
            this.prisma.notificationCampaign.count({ where: { targetStructureId: { in: (await this.prisma.structure.findMany({ where: under(n), select: { id: true } })).map((x) => x.id) }, status: 'SENT', sentAt: { gte: range.from, lt: range.to } } }),
          ])
          pubs += p._count
          reads += p._sum.readCount ?? 0
          plays += s._sum.playCount ?? 0
          return [n.name, fmtInt(p._count), fmtInt(p._sum.readCount ?? 0), fmtInt(s._sum.playCount ?? 0), fmtInt(c)]
        }),
      )
      kpis = [['Publications', fmtInt(pubs)], ['Lectures', fmtInt(reads)], ['Écoutes', fmtInt(plays)]]
    }

    return {
      type,
      title: TITLES[type],
      period: { label: range.label, from: range.from.toISOString(), to: range.to.toISOString() },
      scope: scope.name,
      kpis,
      columns,
      rows,
      generatedAt: new Date().toISOString(),
    }
  }

  /** Tableau de données pour CSV et Excel : nombres rendus en nombres. */
  table(r: ReportDto): Array<Array<string | number>> {
    const num = (s: string) => {
      const n = Number(s.replace(/[\s  ]/g, '').replace(',', '.'))
      return /^[\d\s  ,.]+$/.test(s) && Number.isFinite(n) ? n : s
    }
    return [r.columns, ...r.rows.map((row) => row.map((c, i) => (i === 0 ? c : num(c))))]
  }

  pdf(r: ReportDto, author: string): Promise<Buffer> {
    const ascii = (s: string) => s.replace(/[  ]/g, ' ')
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, info: { Title: `${r.title} · ${r.period.label}`, Author: 'CEPCA Digital' } })
      const chunks: Buffer[] = []
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)
      const green = '#1f5a36'
      doc.font('Helvetica-Bold').fontSize(18).fillColor(green).text(`Rapport · ${r.title}`)
      doc.font('Helvetica').fontSize(10).fillColor('#55665a').text(`${r.scope} · ${r.period.label} · généré le ${new Date(r.generatedAt).toLocaleString('fr-FR', { timeZone: 'Africa/Douala' })} par ${author}`)
      doc.moveDown(0.8)
      doc.fillColor('#1c2a21').font('Helvetica-Bold').fontSize(11).text(r.kpis.map(([k, v]) => `${k} : ${ascii(v)}`).join('     '))
      doc.moveDown(0.8)
      const width = doc.page.width - 80
      const colW = r.columns.map((_, i) => (i === 0 ? width * 0.3 : (width * 0.7) / Math.max(1, r.columns.length - 1)))
      const row = (cells: string[], bold: boolean) => {
        const y = doc.y
        if (y > doc.page.height - 60) doc.addPage()
        let x = 40
        const top = doc.y
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(bold ? green : '#1c2a21')
        cells.forEach((c, i) => {
          doc.text(ascii(c), x + 2, top, { width: colW[i] - 4, align: i === 0 ? 'left' : 'right' })
          x += colW[i]
        })
        doc.y = Math.max(doc.y, top + 14)
        doc.moveTo(40, doc.y + 2).lineTo(40 + width, doc.y + 2).strokeColor('#e3ddd0').lineWidth(0.5).stroke()
        doc.y += 6
      }
      row(r.columns, true)
      for (const cells of r.rows) row(cells, false)
      if (r.rows.length === 0) doc.font('Helvetica-Oblique').fontSize(10).fillColor('#55665a').text('Aucune donnée sur cette période.', 40)
      doc.end()
    })
  }
}
