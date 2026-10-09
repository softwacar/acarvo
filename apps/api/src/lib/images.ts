import { createHash } from 'node:crypto'
import sharp, { type Metadata } from 'sharp'
import { AppError } from './errors'

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const MAX_INPUT_PIXELS = 60_000_000
const MIN_WIDTH = 400
const MIN_HEIGHT = 300
const ACCEPTED = new Set(['jpeg', 'png', 'webp'])

const invalid = (message: string) => new AppError(415, 'UNSUPPORTED_IMAGE', message)

/**
 * Validates a photo by decoding its content (the file name and the browser's MIME type are
 * ignored), applies the camera orientation, and re-encodes it. Re-encoding drops all
 * metadata: EXIF, GPS position, camera serials, XMP and comments.
 */
export async function processPromoPhoto(input: Buffer) {
  let meta: Metadata
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).metadata()
  } catch {
    throw invalid('Dosya okunabilir bir fotoğraf değil. JPEG, PNG veya WebP yükleyin.')
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw invalid('Yalnız JPEG, PNG veya WebP fotoğraf yüklenebilir.')
  if ((meta.pages ?? 1) > 1) throw invalid('Hareketli veya çok sayfalı görseller kabul edilmez.')
  const portrait = (meta.orientation ?? 1) >= 5
  const w = portrait ? meta.height : meta.width
  const h = portrait ? meta.width : meta.height
  if (!w || !h || w < MIN_WIDTH || h < MIN_HEIGHT) {
    throw new AppError(422, 'IMAGE_TOO_SMALL', `Fotoğraf en az ${MIN_WIDTH}×${MIN_HEIGHT} piksel olmalı.`)
  }

  try {
    const base = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).rotate()
    const main = await base
      .clone()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer({ resolveWithObject: true })
    const thumb = await base.clone().resize({ width: 480, height: 360, fit: 'cover', position: 'attention' }).webp({ quality: 78 }).toBuffer()
    return {
      main: main.data,
      thumb,
      width: main.info.width,
      height: main.info.height,
      sha256: createHash('sha256').update(main.data).digest('hex'),
    }
  } catch {
    throw invalid('Fotoğraf işlenemedi. Dosya bozuk olabilir.')
  }
}
