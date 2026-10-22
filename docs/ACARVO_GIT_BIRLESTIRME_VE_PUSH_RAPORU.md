# ACARVO — Git Birleştirme ve GitHub Push Raporu

**Tarih:** 2026-10-22 · **Ana proje klasörü:** `C:\Users\soena\Desktop\acarvo` · **Remote:** `origin` (`github.com/softwacar/acarvo`, adres değiştirilmedi, kimlik bilgisi yazılmadı)

> Gerçek sonuçlar aşağıdadır. Başarısız olan veya yapılmayan her şey açıkça işaretlidir.

## 1. Başlangıçtaki üç klasörün durumu

| Klasör | Dal | HEAD | Durum |
|---|---|---|---|
| `acarvo` (ana) | `main` | `44354d0` | **Aynı Git deposunun ana çalışma ağacı.** 6 izlenen dosya silinmiş görünüyordu, başka değişiklik yoktu |
| `acarvo-demo-ui` | `frontend-prototip-v1` | `9d7fa45` | Aynı depo, ayrı worktree. 2 izlenmeyen belge (aşağıda) |
| `acarvo-frontend-v1` | `frontend-v1-urun-uygulama` | `136ae12` | Aynı depo, ayrı worktree. Temizdi |

`git worktree list` üçünü aynı depoya ait üç worktree olarak doğruladı.

## 2. Son frontend dalı doğrulaması

`frontend-v1-urun-uygulama` (`136ae12`) temizdi; `44354d0` (main), `9d7fa45` (önceki frontend prototipi), `c36d4ee`, `0db4b0d`, `0e52409`, `0141bea`, `cf5daca` hepsi bu dalın atasıdır (45 commit main'in önünde). İçerik doğrulandı: 21 menülü yapı (`core/modules.ts`), Görevler/İşlerim, finans aşamaları, kaparo ve kısmi iade, masraflar, şube kasaları, kullanıcılar ve roller, kurulum sihirbazı, TR/EN, testler (`acceptance`, `former-screens`, `tasks`, …), ürün analizi ve karar belgeleri (`docs/ACARVO_KAPSAMLI_URUN_ANALIZ_RAPORU.md`, `docs/ACARVO_V1_URUN_MIMARISI_VE_KARARLAR.md`), iki frontend raporu.

## 3. Altı silinmiş dosya — yedek ve karar durumu

Silinmiş görünen altı izlenen dosya (main'de, çalışma ağacında silinmiş; neden silindiği **belirlenmedi**):

1. `ACARVO_GLOBAL_WEB_UI_V1_SPEC.md`
2. `docs/BAKIM_HASAR_TRANSFER_V1_GELISTIRME_RAPORU.md`
3. `docs/FINANS_YONETIMI_V1_GELISTIRME_RAPORU.md`
4. `docs/MUSTERILER_KURUMSAL_HESAPLAR_PLANI.md`
5. `docs/OPERASYONEL_HAZIRLIK_DASHBOARD_RAPORU.md`
6. `docs/TEKNIK_UYGULAMA.md`

**Yedekler (silinmedi, silinmeyecek):**
- **Git stash:** `stash@{0}` = `6b7e0dd1c6a120446e4baa3c0c18d3b3663cfd3c` ("ACARVO: 6 silinmis izlenen dosya … karar bekliyor"). İçeriği doğrulandı: yalnız bu 6 dosyanın silinmesi (`D` ×6).
- **Kalıcı dal referansı:** `backup/silinen-6-dosya-2026-10-22` → aynı commit (stash temizlense bile korunur).
- **Dosya yedekleri (`.git` içinde):** `acarvo-silinen-dosyalar.txt`, `acarvo-silinen-dosyalar.patch` (silme farkının tamamı), `acarvo-pre-merge-status.txt`.
- Dosyaların kendi içeriği her zaman Git geçmişinde (main `44354d0` ve sonrası) durur.

Başka kullanıcı değişikliği yoktu. **Silmeler yeni main commit'ine dahil edilmedi ve yeniden uygulanmadı; dosyalar şu an main çalışma ağacında mevcuttur.** **Bu altı dosya hakkındaki karar hâlâ beklemektedir** (silinecek mi, korunacak mı).

## 4. GitHub durumu

- Bağlantı var (`git fetch` başarılı). Başlangıçta: yerel `main` = `44354d0`; `origin/main` = `2f60233` (yerelde olmayan **2 commit**: `d42dbf4` "Add files via upload" ve `2f60233` "Delete vercel.json", yazar Abdullah Acar, 2026-10-19). Bu iki commit yalnız `vercel.json` ekleyip silmiştir: **net içerik farkı yok**.
- Yerel main, remote'un atasıydı (fast-forward mümkün); frontend dalı ise remote'un 2 commit'ini içermediği için main'in **doğrudan devamı değildi**.

## 5. Birleştirme yöntemi ve sonucu

1. `git merge --ff-only origin/main` → main = `2f60233` (başkasının commit'leri korunarak).
2. `git merge --no-ff frontend-v1-urun-uygulama` → birleştirme commit'i **`3bc8d1f`**. Çakışma yok. Sonuç ağacı `136ae12` ile **birebir aynı** (`git diff 136ae12 HEAD` boş).
3. `git reset --hard`, force push, kontrolsüz silme **kullanılmadı**. Geliştirme dalları ve eski commit'ler korunuyor.

## 6. Testler (birleşik main, ana klasörde)

| Kontrol | Sonuç |
|---|---|
| TypeScript (4 çalışma alanı) | temiz |
| Normal web build | temiz |
| Demo birim (vitest) | **178 / 178** geçti |
| Demo tarayıcı | **356 / 356** geçti (14,8 dk) |
| Gerçek API (`acarvo_test`) | **523 / 534 geçti, 11 başarısız** — aşağıya bakın |
| Gerçek tarayıcı (`acarvo_test`) | **134 geçti / 36 atlandı** (başlangıçla aynı; tek başına yeniden koşuldu, 16,8 dk) |

**11 başarısız API testi (10 × `finance.test.ts`, 1 × `rentals.test.ts` "a time that never happened…"):** testlerde sabit tarihler ve "bugünden N gün" hesapları var; bugün (22 Ekim 2026, DST dönüşünden üç gün önce) farklı fiyat ve çakışma sonucu veriyor (ör. beklenen 11.700, gelen 17.550). **Kanıt:** aynı iki test dosyası **eski main kodunda (`44354d0`, geçici worktree) bugün çalıştırıldığında aynı 11 test aynı şekilde düştü.** Backend ve `packages/` bu birleştirmede değişmedi (`git diff 44354d0 HEAD -- apps/api packages` yalnız önceki prototip dalından gelen tek satırlık test düzeltmesini gösterir). Yani bu başarısızlıklar birleştirmeden kaynaklanmıyor; testlerin tarihe bağımlı olduğu bilinen bir **önceden var olan sorundur ve ayrıca düzeltilmelidir** (bu işte düzeltilmedi, kapsam dışı).

**Kendi hatam ve düzeltmesi:** ilk gerçek tarayıcı koşusunda, aynı `acarvo_test` veritabanına API testlerini eşzamanlı çalıştırdım; testler veritabanını sıfırladığı için o koşu geçersiz oldu (120 başarısız). Bu sonuç **kullanılmadı**; gerçek tarayıcı testleri tek başına yeniden koşuldu. Ana `acarvo` veritabanına hiçbir test, seed, reset veya migration uygulanmadı.

## 7. GitHub push

**Başarılı.** Normal `git push origin main` (force yok): `2f60233..2911fdd`. Doğrulama (`git fetch` + `git ls-remote`):

| | Commit |
|---|---|
| Yerel `main` (push anında) | `2911fdd024ceed5db546f57e9d6a72ac0c169fa5` |
| `origin/main` (GitHub) | `2911fdd024ceed5db546f57e9d6a72ac0c169fa5` |
| Son frontend commit'i | `136ae12` (birleştirme `3bc8d1f` ile main'de) |
| Remote'tan önce alınan commit'ler | `d42dbf4`, `2f60233` (korundu) |

`main...origin/main` = 0/0. Push öncesi `origin/main` hâlâ `2f60233` idi (beklenmedik ilerleme yok), branch protection engeli çıkmadı. `2911fdd` bu raporu içerir; bu bölüm push sonrası eklenen sonraki commit'tedir.

## 8. Worktree'ler

Her iki yardımcı worktree **Git'in kendi komutuyla, `--force` olmadan** kaldırıldı (`git worktree remove`):

| Worktree | Kaldırma öncesi kontrol | Sonuç |
|---|---|---|
| `acarvo-frontend-v1` (`136ae12`) | temiz; dal main'e birleşmiş; yalnız ignore edilen üretilmiş dosyalar (derleme/test çıktıları, `node_modules`) | **kaldırıldı** |
| `acarvo-demo-ui` (`9d7fa45`) | dal main'e birleşmiş. 2 izlenmeyen belge (`ACARVO_KAPSAMLI_URUN_ANALIZ_RAPORU.md`, `ACARVO_V1_URUN_MIMARISI_VE_KARARLAR.md`): **main'deki sürümleriyle blob hash'i birebir aynı**; yine de önce `.git/acarvo-yedek-demo-ui-ignored/` içine kopyalandı. İgnore edilen denetim aracı çıktıları (`crawl-*.json/log`, `dialogs-*.json`, `entext*.json`, `langswitch-*.json`, 13 dosya) aynı klasöre yedeklendi. `.auth`, test raporu ve derleme klasörleri yeniden üretilebilir (yedeklenmedi) | **kaldırıldı** |

Kaldırmadan sonra her iki klasörde yalnız hedefleri artık olmayan `node_modules@acarvo*` çalışma alanı bağlantıları (junction) kalmıştı; yalnız bu bağlantılar ve boş klasörler tek tek silindi (içeriği takip eden toplu silme yapılmadı). Test için geçici açtığım `.tmp-old-main` worktree'si de kaldırıldı. **Silinen hiçbir dal yok:** `frontend-prototip-v1` (`9d7fa45`), `frontend-v1-urun-uygulama` (`136ae12`) ve eski tüm dallar duruyor.

## 9. Masaüstünde kalan klasörler

Masaüstünde `acarvo` (ana proje, `main`, `2911fdd`) kaldı. Masaüstünde ayrıca **`Acar`** adlı başka bir klasör var; bu işin parçası değildir, içeriğine bakılmadı ve dokunulmadı.

Korunanlar: `stash@{0}` ve `backup/silinen-6-dosya-2026-10-22` (6 silinmiş dosya), `.git/acarvo-silinen-dosyalar.{txt,patch}`, `.git/acarvo-pre-merge-status.txt`, `.git/acarvo-yedek-demo-ui-ignored/`. **Altı dosya hakkındaki karar hâlâ beklemektedir.**

## 10. Sonraki geliştirmeler için tek proje çalışma düzeni

- **Varsayılan klasör:** `C:\Users\soena\Desktop\acarvo`, dal `main` (veya iş dalı).
- Yeni iş için kısa ömürlü dal: `git switch -c <is-adi>`; iş bitince testlerle `main`'e `--no-ff`/fast-forward, normal `git push`.
- Ayrı çalışma ağacı gerekirse **masaüstüne kalıcı klasör bırakmadan**, geçici ve repo içinde ignore edilen bir yolda: `git worktree add .tmp-<ad> <dal>` → iş bitince `git worktree remove .tmp-<ad>` (force yok).
- **Gerçek testler:** `acarvo_test` için aynı anda tek koşu (API ve tarayıcı testleri aynı veritabanını sıfırlar; eşzamanlı çalıştırılmaz).
- **Açık işler:** (1) altı silinmiş dosya kararı, (2) 11 tarihe bağlı eski API testinin düzeltilmesi, (3) premium tasarım sprinti (önce anahtar tabanlı TR/EN katalog).
