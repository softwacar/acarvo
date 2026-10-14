import { test as setup } from '@playwright/test'
import { authFile, login, type User } from './fixtures'

for (const who of ['adnan', 'selma', 'lejla', 'kontrol'] as User[]) {
  setup(`sign in ${who}`, async ({ page }) => {
    await login(page, who)
    await page.context().storageState({ path: authFile(who) })
  })
}
