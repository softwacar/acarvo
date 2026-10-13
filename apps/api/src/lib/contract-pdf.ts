import { readFile } from 'node:fs/promises'
import fontkit from '@pdf-lib/fontkit'
import { degrees, PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib'

/**
 * Contract draft PDF (Contracts V1, F6/F7). Plain text from the immutable snapshot, an unmissable
 * "TASLAK — HUKUKİ ONAY BEKLİYOR" mark on every page, no signature fields or images, no external resources.
 * Metadata stays neutral: no names, numbers or other personal data in the document properties.
 */
export const DRAFT_MARK = 'TASLAK — HUKUKİ ONAY BEKLİYOR'
const FOOTER_NOTE = 'ACARVO taslağıdır. İmza, ödeme, fatura veya hukuki onay içermez.'

let fonts: Promise<[Uint8Array, Uint8Array]> | null = null
const loadFonts = () =>
  (fonts ??= Promise.all([
    readFile(new URL('../../assets/fonts/DejaVuSans.ttf', import.meta.url)),
    readFile(new URL('../../assets/fonts/DejaVuSans-Bold.ttf', import.meta.url)),
  ]))

export interface ContractPdfInput {
  title: string
  /** Short header lines (label, value); values are plain text from the snapshot. */
  header: [string, string][]
  body: string
  footerId: string
  createdAt: Date
}

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 56
const SIZE = 10
const LEADING = 14

/** Keeps printable text only (no control characters); tabs become spaces. */
const clean = (s: string) => s.replace(/\t/g, '    ').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of clean(text).split(/\r?\n/)) {
    if (!para.trim()) {
      out.push('')
      continue
    }
    let line = ''
    for (const word of para.split(/(\s+)/)) {
      const next = line + word
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next
        continue
      }
      if (line.trim()) out.push(line.trimEnd())
      line = word.trimStart()
      // A single word wider than the line is cut (long references, no spaces).
      while (font.widthOfTextAtSize(line, size) > width) {
        let cut = line.length - 1
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--
        out.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    out.push(line.trimEnd())
  }
  return out
}

export async function renderContractPdf(input: ContractPdfInput): Promise<Buffer> {
  const [regularBytes, boldBytes] = await loadFonts()
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const regular = await pdf.embedFont(regularBytes, { subset: true })
  const bold = await pdf.embedFont(boldBytes, { subset: true })
  pdf.setTitle('Kiralama sözleşmesi taslağı')
  pdf.setSubject(DRAFT_MARK)
  pdf.setProducer('ACARVO')
  pdf.setCreator('ACARVO')
  pdf.setAuthor('')
  pdf.setKeywords([])
  pdf.setCreationDate(input.createdAt)
  pdf.setModificationDate(input.createdAt)

  const width = A4[0] - MARGIN * 2
  const pages: PDFPage[] = []
  let page!: PDFPage
  let y = 0
  const newPage = () => {
    page = pdf.addPage(A4)
    pages.push(page)
    y = A4[1] - MARGIN
    // The draft band at the top of every page.
    page.drawRectangle({ x: MARGIN, y: y - 18, width, height: 22, color: rgb(1, 0.95, 0.85), borderColor: rgb(0.8, 0.45, 0.05), borderWidth: 0.8 })
    const w = bold.widthOfTextAtSize(DRAFT_MARK, 10)
    page.drawText(DRAFT_MARK, { x: MARGIN + (width - w) / 2, y: y - 11, size: 10, font: bold, color: rgb(0.55, 0.28, 0) })
    y -= 40
  }
  const ensure = (h: number) => {
    if (y - h < MARGIN + 30) newPage()
  }

  newPage()
  for (const line of wrap(input.title, bold, 15, width)) {
    ensure(20)
    page.drawText(line, { x: MARGIN, y, size: 15, font: bold, color: rgb(0.1, 0.1, 0.12) })
    y -= 20
  }
  y -= 4
  const labelW = 150
  for (const [label, value] of input.header) {
    const lines = wrap(value || '—', regular, 9, width - labelW)
    ensure(lines.length * 12 + 2)
    page.drawText(clean(label), { x: MARGIN, y, size: 9, font: bold, color: rgb(0.35, 0.35, 0.4) })
    for (const l of lines) {
      page.drawText(l, { x: MARGIN + labelW, y, size: 9, font: regular, color: rgb(0.1, 0.1, 0.12) })
      y -= 12
    }
    y -= 2
  }
  y -= 6
  ensure(10)
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + width, y }, thickness: 0.5, color: rgb(0.75, 0.75, 0.78) })
  y -= 18
  for (const line of wrap(input.body, regular, SIZE, width)) {
    ensure(LEADING)
    if (line) page.drawText(line, { x: MARGIN, y, size: SIZE, font: regular, color: rgb(0.1, 0.1, 0.12) })
    y -= LEADING
  }

  // Diagonal mark and footer on every page, drawn last so the page count is known.
  pages.forEach((p, i) => {
    const size = 34
    const w = bold.widthOfTextAtSize(DRAFT_MARK, size)
    p.drawText(DRAFT_MARK, { x: A4[0] / 2 - (w / 2) * Math.cos(Math.PI / 5), y: A4[1] / 2 - (w / 2) * Math.sin(Math.PI / 5), size, font: bold, rotate: degrees(36), color: rgb(0.85, 0.4, 0.05), opacity: 0.12 })
    const footer = `${clean(input.footerId)} · Sayfa ${i + 1} / ${pages.length} · ${FOOTER_NOTE}`
    for (const [k, l] of wrap(footer, regular, 7.5, width).entries()) p.drawText(l, { x: MARGIN, y: MARGIN - 16 - k * 10, size: 7.5, font: regular, color: rgb(0.4, 0.4, 0.45) })
  })
  return Buffer.from(await pdf.save({ useObjectStreams: true }))
}
