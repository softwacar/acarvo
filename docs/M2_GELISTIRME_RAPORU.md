# ACARVO — M2 Geliştirme Raporu (Müşteri belgeleri)

Dal: `musteriler-m2` (worktree: `Desktop/acarvo-m2`; ana çalışma klasörü ve 3001/5173 sunucuları `main` üzerinde dokunulmadan çalışmaya devam eder).
Plan ve kararlar: `docs/M2_MUSTERI_BELGELERI_PLANI.md` §0.

Sınırlar: ana `acarvo` veritabanına M2 migration'ı uygulanmaz (yalnız dry-run), `.env` değiştirilmez, gerçek anahtar üretilmez, push yapılmaz, M3 ve sonrası başlamaz. Testler yalnız `acarvo_test` üzerinde ve geçici sentetik anahtarlarla çalışır.

## Aşama 0 — Hazırlık
- Dal ve worktree oluşturuldu; bağımlılıklar worktree'ye ayrıca kuruldu.
- Test yapılandırmaları `.env` konumunu `ACARVO_ENV_FILE` değişkeninden okuyabilir (ikinci worktree, `.env` kopyalanmadan çalışır). Davranış değişikliği yok: değişken yoksa eskisi gibi depo kökündeki `.env` kullanılır.
- Plan §0'a kesinleşen kararlar yazıldı.

