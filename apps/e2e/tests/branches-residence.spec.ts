import { expect, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow } from './fixtures'

// M2b: branch country (owner only, bulk with preview and confirmation) and residence country separate from nationality.
// Test database: Drina branches have country BA in the test seed; Neretva's branch has none.

test('owner sets a branch country; the change is explicit and saved', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('adnan'), viewport: { width: 1440, height: 900 }, locale: 'tr-TR' })
  const page = await ctx.newPage()
  await page.goto('/subeler')
  const sjj = page.getByLabel('Sarajevo Aerodrom şubesinin ülkesi')
  await expect(sjj).toHaveValue('BA')
  await sjj.selectOption('HR')
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText('Sarajevo Aerodrom: ülke Hırvatistan.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Sarajevo Aerodrom şubesinin ülkesi')).toHaveValue('HR')
  await page.getByLabel('Sarajevo Aerodrom şubesinin ülkesi').selectOption('BA')
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText('Sarajevo Aerodrom: ülke Bosna-Hersek.')).toBeVisible()
  // Every Drina branch has a country, so there is nothing to bulk-assign.
  await expect(page.getByRole('button', { name: 'Toplu ülke ata' })).toHaveCount(0)
  await ctx.close()
})

test('a user without the permission sees branch countries read-only', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('selma'), locale: 'tr-TR' })
  const page = await ctx.newPage()
  await page.goto('/subeler')
  await expect(page.getByRole('cell', { name: 'Bosna-Hersek' })).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await ctx.close()
})

test('bulk assignment previews the affected branches and changes nothing until confirmed', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('lejla'), viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'tr-TR' })
  const page = await ctx.newPage()
  await page.goto('/subeler')
  await expect(page.getByLabel('Mostar Centar şubesinin ülkesi')).toHaveValue('')
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: 'Toplu ülke ata' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ülkesi tanımlanmamış şubelere toplu atama' })
  await dialog.getByLabel('Atanacak ülke').selectOption('BA')
  await dialog.getByRole('button', { name: 'Önizle' }).click()
  const affected = dialog.getByRole('region', { name: 'Etkilenecek şubeler' })
  await expect(affected).toContainText('1 şubenin ülkesi “Bosna-Hersek” olacak')
  await expect(affected).toContainText('MOC')
  // Closing without confirming leaves the branch unchanged.
  await dialog.getByRole('button', { name: 'Vazgeç' }).click()
  await expect(page.getByLabel('Mostar Centar şubesinin ülkesi')).toHaveValue('')
  await page.getByRole('button', { name: 'Toplu ülke ata' }).click()
  await dialog.getByLabel('Atanacak ülke').selectOption('BA')
  await dialog.getByRole('button', { name: 'Önizle' }).click()
  await dialog.getByRole('button', { name: 'Onayla ve uygula' }).click()
  await expect(page.getByText('1 şubeye ülke atandı.')).toBeVisible()
  await expect(page.getByLabel('Mostar Centar şubesinin ülkesi')).toHaveValue('BA')
  await expect(page.getByRole('button', { name: 'Toplu ülke ata' })).toHaveCount(0)
  await ctx.close()
})

test.describe('residence country', () => {
  test.use({ storageState: authFile('adnan') })

  test('is entered separately from nationality and shown as its own fact; the M1 classification stays as recorded', async ({ page }) => {
    await page.goto('/musteriler')
    await page.getByRole('button', { name: 'Yeni müşteri' }).click()
    const form = page.getByRole('dialog', { name: 'Yeni müşteri' })
    await form.locator('#givenName').fill('Ayrı')
    await form.locator('#familyName').fill('Ülkeler')
    await form.locator('#phone').fill('+387 61 000 401')
    await form.locator('#nationality').selectOption('BA')
    await form.locator('#residenceCountry').selectOption('DE')
    await form.getByRole('button', { name: 'Müşteriyi kaydet' }).click()
    await expect(page.getByRole('heading', { name: 'Ayrı Ülkeler' })).toBeVisible()
    await expect(page.getByText('İkamet ettiği ülke: Almanya · Uyruk: Bosna-Hersek')).toBeVisible()
    await expect(page.getByText('Eski M1 sınıflandırması')).toHaveCount(0)

    // A record from M1 keeps its classification next to — not instead of — residence country and nationality.
    await page.goto('/musteriler')
    await page.getByRole('searchbox', { name: 'Müşterilerde ara' }).fill('Selin Deneme')
    await page.getByRole('link', { name: 'Selin Deneme' }).click()
    await expect(page.getByText('İkamet ettiği ülke: Bosna-Hersek · Uyruk: Türkiye')).toBeVisible()
    const facts = page.locator('section').filter({ hasText: 'Kişi bilgileri' }).first()
    await expect(facts.getByText('Eski M1 sınıflandırması')).toBeVisible()
    await expect(facts.getByText('Yabancı (ikamet)')).toBeVisible()
    // Editing keeps it: the form shows it read-only and does not send a change.
    await page.getByRole('button', { name: 'Düzenle' }).first().click()
    const edit = page.getByRole('dialog', { name: 'Müşteriyi düzenle' })
    await expect(edit.getByText('Bu kayıtta eski M1 sınıflandırması korunuyor', { exact: false })).toBeVisible()
    await edit.locator('#city').fill('Sarajevo')
    await edit.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
    await expect(edit).toHaveCount(0)
    await expect(facts.getByText('Yabancı (ikamet)')).toBeVisible()
  })

  test('the list shows residence and nationality and filters by residence country', async ({ page }) => {
    await page.goto('/musteriler')
    await page.getByLabel('İkamet ettiği ülke').selectOption('DE')
    await expect(page).toHaveURL(/residenceCountry=DE/)
    await expect(page.getByRole('link', { name: 'Lena Beispiel' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ajla Testović' })).toHaveCount(0)
    const lena = page.locator('tbody tr', { hasText: 'Lena Beispiel' })
    await expect(lena).toContainText('İkamet: Almanya')
    await expect(lena).toContainText('Uyruk: Almanya')
    // Ayrı Ülkeler (previous test) lives in Germany but is a Bosnian national: the two facts stay apart.
    const ayri = page.locator('tbody tr', { hasText: 'Ayrı Ülkeler' })
    if (await ayri.count()) await expect(ayri).toContainText('Uyruk: Bosna-Hersek')
  })
})
