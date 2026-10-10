// Resets acarvo_test for the browser tests (apps/e2e): same guarded reset as the API tests, with the
// run password from E2E_PASSWORD. Refuses to run against any database other than acarvo_test.
import { appPool, ownerPool, resetDatabase } from './helpers'

if (!process.env.E2E_PASSWORD) throw new Error('E2E_PASSWORD missing')
await resetDatabase()
await ownerPool.end()
await appPool.end()
console.log('e2e: acarvo_test reset and seeded')

// Upload fixtures for the browser tests: two photos and two plain test PDFs (clearly marked as test files).
const out = process.env.E2E_FIXTURES
if (out) {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const path = await import('node:path')
  const sharp = (await import('sharp')).default
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  mkdirSync(out, { recursive: true })
  const photo = (r: number, g: number, b: number) =>
    sharp({ create: { width: 1200, height: 800, channels: 3, background: { r, g, b } } }).jpeg({ quality: 80 }).toBuffer()
  writeFileSync(path.join(out, 'foto-mavi.jpg'), await photo(40, 80, 200))
  writeFileSync(path.join(out, 'foto-gri.jpg'), await photo(150, 150, 150))
  for (const name of ['test-muayene.pdf', 'test-muayene-yeni.pdf']) {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    doc.addPage([420, 300]).drawText(`ACARVO TEST BELGESI - ${name}`, { x: 30, y: 150, size: 14, font })
    writeFileSync(path.join(out, name), Buffer.from(await doc.save()))
  }
  console.log('e2e: fixtures written')
}
