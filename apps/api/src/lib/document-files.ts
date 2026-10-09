import { createHash } from 'node:crypto'
import { EncryptedPDFError, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import sharp from 'sharp'
import { MAX_DOCUMENT_IMAGE_MB, MAX_DOCUMENT_PDF_MB, MAX_DOCUMENT_PDF_PAGES } from '@acarvo/shared'
import { AppError } from './errors'

export const MAX_DOCUMENT_BYTES = MAX_DOCUMENT_PDF_MB * 1024 * 1024
const MAX_IMAGE_BYTES = MAX_DOCUMENT_IMAGE_MB * 1024 * 1024
const MAX_INPUT_PIXELS = 60_000_000

const reject = (message: string, code = 'UNSUPPORTED_DOCUMENT') => new AppError(415, code, message)

export type DocumentKind = 'pdf' | 'jpeg' | 'png'

/** File type from its first bytes only; the name and the browser's type are ignored. */
export function sniff(data: Buffer): DocumentKind | null {
  if (data.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf'
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg'
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  return null
}

// Keys and action types that make a PDF active content rather than a document.
const BANNED_KEYS = ['JS', 'JavaScript', 'EmbeddedFile', 'EmbeddedFiles', 'XFA', 'RichMedia', 'RichMediaContent', 'Launch']
const BANNED_ACTIONS = new Set(['JavaScript', 'Launch', 'ImportData', 'SubmitForm', 'GoToE', 'RichMediaExecute', 'Rendition', 'Sound', 'Movie'])
const BANNED_TYPES = new Set(['EmbeddedFile', 'RichMedia'])

function inspectDict(dict: PDFDict): string | null {
  for (const key of BANNED_KEYS) if (dict.has(PDFName.of(key))) return key
  const s = dict.get(PDFName.of('S'))
  if (s instanceof PDFName && BANNED_ACTIONS.has(s.decodeText())) return s.decodeText()
  const type = dict.get(PDFName.of('Type'))
  if (type instanceof PDFName && BANNED_TYPES.has(type.decodeText())) return type.decodeText()
  if (dict.has(PDFName.of('EF'))) return 'EF'
  return null
}

/** Walks every object (including those inside object streams) for active or embedded content. */
function findActiveContent(doc: PDFDocument): string | null {
  const visit = (obj: unknown, depth: number): string | null => {
    if (depth > 12) return null
    if (obj instanceof PDFRawStream) return visit(obj.dict, depth + 1)
    if (obj instanceof PDFDict) {
      const hit = inspectDict(obj)
      if (hit) return hit
      for (const [, value] of obj.entries()) {
        const h = visit(value, depth + 1)
        if (h) return h
      }
    }
    if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.size(); i++) {
        const h = visit(obj.get(i), depth + 1)
        if (h) return h
      }
    }
    return null
  }
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const hit = visit(obj, 0)
    if (hit) return hit
  }
  return visit(doc.context.trailerInfo.Root ? doc.catalog : null, 0)
}

export interface CleanDocument {
  data: Buffer
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png'
  ext: 'pdf' | 'jpg' | 'png'
  pageCount: number | null
  sha256: string
}

/**
 * Accepts a document file only after validating its content:
 *  - PDF: parsed; encrypted, JavaScript, launch/import/submit actions, embedded files, XFA and rich
 *    media are rejected; 1–50 pages. Stored byte-for-byte (the server never renders PDFs).
 *  - JPEG/PNG: decoded and re-encoded in the same format, which removes EXIF/GPS and other metadata.
 */
export async function validateDocumentFile(input: Buffer): Promise<CleanDocument> {
  const kind = sniff(input)
  if (!kind) throw reject('Yalnız PDF, JPEG veya PNG belge yüklenebilir.')
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

  if (kind === 'pdf') {
    if (input.length > MAX_DOCUMENT_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', `PDF en fazla ${MAX_DOCUMENT_PDF_MB} MB olabilir.`)
    // The encryption dictionary is referenced from the (plain-text) trailer or xref stream dictionary.
    if (/\/Encrypt\b/.test(input.toString('latin1'))) throw reject('Şifreli veya parola korumalı PDF kabul edilmez.', 'ENCRYPTED_PDF')
    let doc: PDFDocument
    try {
      doc = await PDFDocument.load(input, { updateMetadata: false, throwOnInvalidObject: true })
    } catch (e) {
      if (e instanceof EncryptedPDFError) throw reject('Şifreli veya parola korumalı PDF kabul edilmez.', 'ENCRYPTED_PDF')
      throw reject('PDF okunamadı. Dosya bozuk olabilir.')
    }
    const pages = doc.getPageCount()
    if (pages < 1) throw reject('PDF en az bir sayfa içermeli.')
    if (pages > MAX_DOCUMENT_PDF_PAGES) throw reject(`PDF en fazla ${MAX_DOCUMENT_PDF_PAGES} sayfa olabilir.`)
    const active = findActiveContent(doc)
    if (active) throw reject('PDF etkin içerik barındırıyor (komut dosyası, gömülü dosya veya form). Yalnız düz belge PDF’i yükleyin.', 'ACTIVE_PDF')
    // Belt and braces for anything the object walk could miss in uncompressed sections.
    const raw = input.toString('latin1')
    if (/\/(JavaScript|JS|Launch|EmbeddedFile|XFA|RichMedia)\b/.test(raw)) {
      throw reject('PDF etkin içerik barındırıyor (komut dosyası, gömülü dosya veya form). Yalnız düz belge PDF’i yükleyin.', 'ACTIVE_PDF')
    }
    return { data: input, mimeType: 'application/pdf', ext: 'pdf', pageCount: pages, sha256: sha(input) }
  }

  if (input.length > MAX_IMAGE_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', `Görsel en fazla ${MAX_DOCUMENT_IMAGE_MB} MB olabilir.`)
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).metadata()
    if (meta.format !== kind) throw new Error('format mismatch')
    if ((meta.width ?? 0) < 200 || (meta.height ?? 0) < 200) throw new AppError(422, 'IMAGE_TOO_SMALL', 'Görsel en az 200×200 piksel olmalı.')
    const pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: 5000, height: 5000, fit: 'inside', withoutEnlargement: true })
    const data = kind === 'jpeg' ? await pipeline.jpeg({ quality: 90 }).toBuffer() : await pipeline.png({ compressionLevel: 9 }).toBuffer()
    return { data, mimeType: kind === 'jpeg' ? 'image/jpeg' : 'image/png', ext: kind === 'jpeg' ? 'jpg' : 'png', pageCount: null, sha256: sha(data) }
  } catch (e) {
    if (e instanceof AppError) throw e
    throw reject('Görsel okunamadı. Dosya bozuk olabilir.')
  }
}

/** Display name for the record only; never used as a path. */
export function cleanDisplayName(name: string | undefined, fallback: string) {
  const n = (name ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '').trim().slice(0, 120)
  return n || fallback
}
