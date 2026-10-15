import { expect, type Page, test } from '@playwright/test'
import { authFile, expectNoHorizontalOverflow, openVehicle, sarajevoWallTime } from './fixtures'

// Maintenance, damage and vehicle transfers V1 in the browser (synthetic data, acarvo_test only). Vehicles used only
// here: T48-K-276 (MST, maintenance), O03-J-874 (MST, damage block), E16-T-093 (SJJ, transfer); K-000004's finding.

const DAY = 86_400_000
const HOUR = 3_600_000

async function currentKm(page: Page, plate: string) {
  return page.evaluate(async (p) => {
    const r = (await (await fetch(`/api/vehicles?q=${encodeURIComponent(p)}`)).json()) as { items: { odometer: { km: number } | null }[] }
    return r.items[0]!.odometer?.km ?? 0
  }, plate)
}
async function pickVehicle(page: Page, plate: string) {
  await page.getByRole('searchbox', { name: 'Araç ara' }).fill(plate)
  await page.getByRole('list', { name: 'Araçlar' }).getByRole('button', { name: new RegExp(plate) }).click()
}
const dialog = (page: Page) => page.getByRole('dialog')

test.describe.serial('maintenance', () => {
  test.use({ storageState: authFile('adnan') })

  test('plan → take into service → work done → complete; km and location in the history; the vehicle shows the hold', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('/bakim-servis')
    await expect(page.getByRole('heading', { name: 'Bakım & Servis' })).toBeVisible()
    await page.getByRole('link', { name: 'Bakım planla' }).click()
    await pickVehicle(page, 'T48-K-276')
    await page.locator('#m-branch').selectOption({ label: 'Mostar' })
    await page.locator('#m-type').selectOption({ label: 'Periyodik bakım' })
    await page.locator('#m-reason').fill('E2E periyodik bakım')
    await page.locator('#m-start').fill(sarajevoWallTime(-30 * 60_000))
    await page.locator('#m-end').fill(sarajevoWallTime(6 * HOUR))
    await page.getByRole('button', { name: 'Planla' }).click()
    await expect(page.getByText('Planlandı', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/henüz servise alınmadı/)).toBeVisible()

    // The vehicle is held now: Vehicle 360° names the maintenance as the reason.
    const detailUrl = page.url()
    await openVehicle(page, 'T48-K-276')
    await expect(page.getByText(/Şu an: Bakım B-\d{6}/).first()).toBeVisible()
    await page.goto(detailUrl)

    await page.getByRole('button', { name: 'Servise al' }).click()
    await dialog(page).getByLabel('Araç dış servise gidiyor').check()
    await dialog(page).locator('#op-provider').fill('E2E Oto Servis')
    await dialog(page).getByRole('button', { name: 'Servise al' }).click()
    await expect(page.getByText('Bakımda', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'İş bitti' }).click()
    await dialog(page).locator('#op-work').fill('Yağ ve filtre değişti')
    await dialog(page).getByRole('button', { name: 'Kontrole gönder' }).click()
    await expect(page.getByText('Kontrol bekliyor', { exact: true }).first()).toBeVisible()
    const km = (await currentKm(page, 'T48-K-276')) + 15
    await page.getByRole('button', { name: 'Tamamla' }).click()
    await dialog(page).locator('#op-km').fill(String(km))
    await dialog(page).locator('#op-return').selectOption({ label: 'Mostar' })
    await dialog(page).getByRole('button', { name: 'Tamamla' }).click()
    await expect(page.getByText('Tamamlandı', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/teslime hazır olduğu anlamına gelmez/).first()).toBeVisible()
    await expect(page.getByRole('region', { name: 'Geçmiş' })).toContainText('Servise alındı')

    await openVehicle(page, 'T48-K-276', 'Bakım ve lastikler')
    await expect(page.getByRole('region', { name: 'Periyodik bakım' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Bakım kayıtları' })).toContainText('Tamamlandı')
    await page.getByRole('tab', { name: /Konum ve geçmiş/ }).click()
    await expect(page.getByText('E2E Oto Servis').first()).toBeVisible()
  })

  test('a conflicting plan is not created silently: the reasons are shown and it can be kept pending (holding nothing)', async ({ page }) => {
    await page.goto('/bakim-servis/yeni')
    const plan = async (reason: string, keep: boolean) => {
      await pickVehicle(page, 'T48-K-276')
      await page.locator('#m-branch').selectOption({ label: 'Mostar' })
      await page.locator('#m-type').selectOption({ label: 'Muayene / kontrol' })
      await page.locator('#m-reason').fill(reason)
      await page.locator('#m-start').fill(sarajevoWallTime(90 * DAY))
      await page.locator('#m-end').fill(sarajevoWallTime(90 * DAY + 4 * HOUR))
      await page.getByRole('button', { name: 'Planla' }).click()
      if (keep) {
        await expect(page.getByText(/Plan, çakışan bir taahhüt oluşturamaz/)).toBeVisible()
        await expect(page.getByText(/^Bakım B-\d{6}$/).first()).toBeVisible()
        await page.getByRole('button', { name: 'Onay bekleyen olarak kaydet' }).click()
      }
    }
    await plan('İlk muayene planı', false)
    await expect(page.getByText('Planlandı', { exact: true }).first()).toBeVisible()
    await page.goto('/bakim-servis/yeni')
    await plan('Çakışan ikinci plan', true)
    await expect(page.getByText('Onay bekliyor', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/Bu plan şu kayıtlarla çakıştığı için aracı tutmuyor/)).toBeVisible()
    await page.goto('/bakim-servis?view=pending_approval')
    await expect(page.getByRole('row', { name: /Çakışan ikinci plan/ })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
})

test.describe.serial('damage', () => {
  test.use({ storageState: authFile('adnan') })

  test('a not-usable damage blocks the vehicle with a reason; lifting it needs a reason and stays in the history', async ({ page }) => {
    test.setTimeout(60_000)
    await openVehicle(page, 'O03-J-874')
    await page.getByRole('link', { name: 'Hasar bildir' }).first().click()
    await expect(page.getByRole('heading', { name: 'Hasar bildir' })).toBeVisible()
    await expect(page.getByText('O03-J-874').first()).toBeVisible() // prefilled from the vehicle
    await page.locator('#d-branch').selectOption({ label: 'Mostar' })
    await page.locator('#d-view').selectOption({ label: 'Ön' })
    await page.locator('#d-type').selectOption({ label: 'Cam' })
    await page.locator('#d-severity').selectOption({ label: 'Ağır' })
    await page.locator('#d-description').fill('Ön camda büyük çatlak')
    await page.getByRole('radio', { name: 'Kullanılamaz' }).check()
    await page.getByRole('button', { name: 'Hasar dosyası aç' }).click()
    await expect(page.getByText('Aracın neden kullanılamayacağını yazın')).toBeVisible()
    await page.locator('#d-block').fill('Görüş engelleniyor')
    await page.getByRole('button', { name: 'Hasar dosyası aç' }).click()
    await expect(page.getByText(/Araç kullanılamaz olarak işaretli/)).toBeVisible()
    await expect(page.getByText(/sorumluluk kararı, ücret, sigorta talebi veya depozito kesintisi oluşturulmaz/).first()).toBeVisible()
    const url = page.url()
    await openVehicle(page, 'O03-J-874')
    await expect(page.getByText(/Şu an: Hasar engeli H-\d{6}/).first()).toBeVisible()
    await page.goto(url)
    await page.getByRole('button', { name: 'Engeli kaldır' }).click()
    await dialog(page).locator('#dm-unreason').fill('Cam değiştirildi')
    await dialog(page).getByRole('button', { name: 'Engeli kaldır' }).click()
    await expect(page.getByText(/Araç kullanılamaz olarak işaretli/)).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Engel geçmişi' })).toContainText('Kaldırıldı: Cam değiştirildi')
    await page.goto('/hasar-kayitlari?view=all')
    await expect(page.getByRole('row', { name: /O03-J-874/ })).toBeVisible()
  })

  test('a return finding of a closed rental becomes one damage file; the rental shows the link', async ({ page }) => {
    await page.goto('/kiralamalar?view=all')
    await page.getByRole('searchbox', { name: 'Kiralamalarda ara' }).fill('K-000004')
    await page.getByRole('row', { name: /K-000004/ }).getByRole('link').first().click()
    await page.getByRole('tab', { name: 'Hasar ve fotoğraflar' }).click()
    const files = page.getByRole('region', { name: 'Hasar dosyaları' })
    await expect(files).toContainText('Teslimde olmayan yeni bulgu')
    await files.getByRole('link', { name: 'Hasar dosyası aç' }).first().click()
    await expect(page.getByText(/kontrolündeki işaret bağlanacak/)).toBeVisible()
    await page.locator('#d-severity').selectOption({ label: 'Orta' })
    await page.getByRole('radio', { name: 'Kısıtlı kullanılabilir' }).check()
    await page.locator('#d-description').fill('İadede arka tamponda göçük')
    await page.getByRole('button', { name: 'Hasar dosyası aç' }).click()
    await expect(page.getByText('Bildirildi', { exact: true }).first()).toBeVisible()
    await page.getByRole('link', { name: 'K-000004' }).click()
    await expect(page.getByRole('region', { name: 'Hasar dosyaları' }).getByRole('link', { name: /^H-\d{6}$/ }).first()).toBeVisible()
  })
})

test.describe.serial('transfers', () => {
  test('request at the origin (Operasyon), approve (Sahip), depart, and only the destination receives', async ({ browser }) => {
    test.setTimeout(90_000)
    const selma = await (await browser.newContext({ storageState: authFile('selma') })).newPage()
    const adnan = await (await browser.newContext({ storageState: authFile('adnan') })).newPage()
    await selma.goto('/araclar/transferler/yeni')
    await pickVehicle(selma, 'E16-T-093')
    await selma.locator('#t-to').selectOption({ label: 'Sarajevo Centar' })
    await selma.locator('#t-dep').fill(sarajevoWallTime(-10 * 60_000))
    await selma.locator('#t-arr').fill(sarajevoWallTime(5 * HOUR))
    await selma.locator('#t-reason').fill('E2E şube ihtiyacı')
    await selma.getByRole('button', { name: 'Talep oluştur' }).click()
    await expect(selma.getByText('Talep edildi', { exact: true }).first()).toBeVisible()
    await expect(selma.getByRole('button', { name: 'Onayla' })).toHaveCount(0) // Operasyon does not approve
    const url = selma.url()

    await adnan.goto(url)
    await adnan.getByRole('button', { name: 'Onayla' }).click()
    await dialog(adnan).getByRole('button', { name: 'Onayla' }).click()
    await expect(adnan.getByText('Onaylandı', { exact: true }).first()).toBeVisible()

    await selma.reload()
    const km = (await currentKm(selma, 'E16-T-093')) + 2
    await selma.getByRole('button', { name: 'Yola çıkar' }).click()
    await dialog(selma).locator('#mv-km').fill(String(km))
    await dialog(selma).locator('#mv-fuel').selectOption({ label: 'Dolu' })
    await dialog(selma).getByRole('button', { name: 'Yola çıkar' }).click()
    await expect(selma.getByText('Yolda', { exact: true }).first()).toBeVisible()
    await expect(selma.getByText(/Teslim alma yalnız varış şubesinin \(SAC\)/)).toBeVisible()
    await selma.goto(`${url}/teslim-al`)
    await expect(selma.getByRole('heading', { name: 'Erişim yetkiniz yok' })).toBeVisible()

    await adnan.goto(url)
    await adnan.getByRole('link', { name: 'Teslim al' }).click()
    await expect(adnan.getByRole('heading', { name: 'Varışta teslim al' })).toBeVisible()
    await adnan.locator('#mv-km').fill(String(km - 1))
    await adnan.locator('#mv-fuel').selectOption({ label: '3/4' })
    await adnan.getByRole('button', { name: 'Teslim al' }).click()
    await expect(adnan.getByText(/düşük olamaz/).first()).toBeVisible()
    await adnan.locator('#mv-km').fill(String(km + 40))
    await adnan.getByRole('button', { name: 'Teslim al' }).click()
    await expect(adnan.getByText('Teslim alındı', { exact: true }).first()).toBeVisible()
    await expect(adnan.getByRole('region', { name: 'Aracın kayıtlı konumu' })).toContainText('SAC')
    await expect(adnan.getByRole('region', { name: 'Çıkış ve varış' })).toContainText('40 km')
  })
})

test.describe('repair transport', () => {
  test.use({ storageState: authFile('adnan') })
  test('a vehicle marked not usable moves only by a repair transport (tow truck), with a departure statement; the block stays after arrival', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/hasar-kayitlari/yeni')
  await pickVehicle(page, 'J27-K-615')
  await page.locator('#d-branch').selectOption({ label: 'Sarajevo Centar' })
  await page.locator('#d-view').selectOption({ label: 'Ön' })
  await page.locator('#d-type').selectOption({ label: 'Mekanik' })
  await page.locator('#d-severity').selectOption({ label: 'Ağır' })
  await page.locator('#d-description').fill('Motor çalışmıyor')
  await page.getByRole('radio', { name: 'Kullanılamaz' }).check()
  await page.locator('#d-block').fill('Araç çalışmıyor')
  await page.getByRole('button', { name: 'Hasar dosyası aç' }).click()
  await expect(page.getByText(/Araç kullanılamaz olarak işaretli/)).toBeVisible()
  const damageUrl = page.url()
  await page.getByRole('link', { name: /Onarım için taşıma başlat/ }).click()
  await expect(page.getByRole('radio', { name: /Onarım amaçlı taşıma/ })).toBeChecked()
  await expect(page.getByText(/kendi gücüyle sürülebileceği anlamına gelmez/)).toBeVisible()
  await expect(page.locator('#t-damage')).toHaveValue(/[0-9a-f-]{36}/)
  await page.locator('#t-method').selectOption({ label: 'Çekici' })
  await page.locator('#t-from').selectOption({ label: 'Sarajevo Centar' })
  await page.locator('#t-to').selectOption({ label: 'Mostar' })
  await page.locator('#t-dep').fill(sarajevoWallTime(-10 * 60_000))
  await page.locator('#t-arr').fill(sarajevoWallTime(4 * HOUR))
  await page.locator('#t-reason').fill('Onarım için servise')
  await page.getByRole('button', { name: 'Talep oluştur' }).click()
  await expect(page.getByRole('heading', { name: /Onarım taşıması/ })).toBeVisible()
  await page.getByRole('button', { name: 'Onayla' }).click()
  await dialog(page).getByRole('button', { name: 'Onayla' }).click()
  await expect(page.getByText('Onaylandı', { exact: true }).first()).toBeVisible()
  const km = await currentKm(page, 'J27-K-615')
  await page.getByRole('button', { name: 'Yola çıkar' }).click()
  await dialog(page).locator('#mv-km').fill(String(km))
  await dialog(page).locator('#mv-fuel').selectOption({ label: '1/4' })
  await dialog(page).getByRole('button', { name: 'Yola çıkar' }).click()
  await expect(dialog(page).getByText(/çekici veya taşıyıcıyla yola çıktığını onaylayın/).first()).toBeVisible()
  await dialog(page).getByRole('checkbox', { name: /kendi gücüyle sürülmediğini beyan ederim/ }).check()
  await dialog(page).getByRole('button', { name: 'Yola çıkar' }).click()
  await expect(page.getByText('Yolda', { exact: true }).first()).toBeVisible()
  await page.getByRole('link', { name: 'Teslim al' }).click()
  await page.locator('#mv-km').fill(String(km))
  await page.locator('#mv-fuel').selectOption({ label: '1/4' })
  await page.getByRole('button', { name: 'Teslim al' }).click()
  await expect(page.getByText('Teslim alındı', { exact: true }).first()).toBeVisible()
  await page.goto(damageUrl)
  await expect(page.getByText(/Araç kullanılamaz olarak işaretli/)).toBeVisible()
  await expect(page.getByText('Bildirildi', { exact: true }).first()).toBeVisible()
})
})

test('another company sees none of these records', async ({ browser }) => {
  const lejla = await (await browser.newContext({ storageState: authFile('lejla') })).newPage()
  for (const [url, empty] of [
    ['/bakim-servis?view=all', 'Bu görünümde bakım yok'],
    ['/hasar-kayitlari?view=all', 'Bu görünümde hasar dosyası yok'],
    ['/araclar/transferler?view=all', 'Bu görünümde transfer yok'],
  ] as const) {
    await lejla.goto(url)
    await expect(lejla.getByRole('heading', { name: empty })).toBeVisible()
  }
})
