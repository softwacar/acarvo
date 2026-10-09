import { MAX_PHOTO_MB, MAX_PROMO_PHOTOS, type VehicleDetail, type VehiclePhoto, type VehiclePhotoList } from '@acarvo/shared'
import {
  ArrowLeft,
  ArrowRight,
  ArrowsOutSimple,
  CaretLeft,
  CaretRight,
  CarProfile,
  DotsSixVertical,
  ImageSquare,
  Plus,
  ShieldCheck,
  SpinnerGap,
  Star,
  Trash,
  UploadSimple,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from 'radix-ui'
import { type DragEvent, useEffect, useRef, useState } from 'react'
import { toast } from '@/components/Toaster'
import { ApiRequestError, photosApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useSession } from '@/session'

const ACCEPT = 'image/jpeg,image/png,image/webp'

interface UploadItem {
  key: string
  name: string
  progress: number
  error?: string
}

/** Sequential uploads with per-file progress; the server validates every file again. */
function useUploader(vehicleId: string, count: number) {
  const session = useSession()
  const qc = useQueryClient()
  const key = ['vehicle-photos', session.company?.id, vehicleId]
  const [items, setItems] = useState<UploadItem[]>([])
  const busy = items.some((i) => !i.error && i.progress < 1)

  const start = async (list: FileList | File[]) => {
    const files = Array.from(list)
    const room = MAX_PROMO_PHOTOS - count
    const queue = files.slice(0, Math.max(0, room))
    const rejected = files.slice(queue.length)
    const entries: (UploadItem & { file?: File })[] = [
      ...queue.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, progress: 0, file: f })),
      ...rejected.map((f, i) => ({ key: `${Date.now()}-x${i}`, name: f.name, progress: 0, error: `En fazla ${MAX_PROMO_PHOTOS} fotoğraf olabilir.` })),
    ]
    for (const e of entries) {
      if (e.file && e.file.size > MAX_PHOTO_MB * 1024 * 1024) e.error = `Dosya ${MAX_PHOTO_MB} MB sınırını aşıyor.`
    }
    setItems((prev) => [...prev.filter((p) => !p.error && p.progress < 1), ...entries.map(({ file: _f, ...rest }) => rest)])
    let added = 0
    for (const e of entries) {
      if (e.error || !e.file) continue
      try {
        await photosApi.upload(vehicleId, e.file, (p) => setItems((prev) => prev.map((x) => (x.key === e.key ? { ...x, progress: Math.min(p, 0.97) } : x))))
        added++
        setItems((prev) => prev.filter((x) => x.key !== e.key))
        await qc.invalidateQueries({ queryKey: key })
      } catch (err) {
        const message = err instanceof ApiRequestError ? err.message : 'Yükleme tamamlanamadı.'
        setItems((prev) => prev.map((x) => (x.key === e.key ? { ...x, error: message } : x)))
      }
    }
    if (added) {
      toast(added === 1 ? 'Fotoğraf eklendi.' : `${added} fotoğraf eklendi.`)
      void qc.invalidateQueries({ queryKey: ['vehicle-activity'] })
    }
  }
  return { items, busy, start, clear: () => setItems((prev) => prev.filter((p) => !p.error && p.progress < 1)) }
}

function UploadStatus({ items, onClear }: { items: UploadItem[]; onClear: () => void }) {
  if (!items.length) return null
  return (
    <ul className="mt-3 space-y-1.5" aria-live="polite">
      {items.map((i) => (
        <li key={i.key} className={cn('flex items-center gap-3 rounded-lg border px-3 py-2 text-[13px]', i.error ? 'border-alert/25 bg-alert-soft text-alert' : 'border-line bg-surface')}>
          {i.error ? <WarningCircle size={16} className="shrink-0" /> : <SpinnerGap size={16} className="shrink-0 animate-spin text-ink-3" />}
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{i.name}</span>
            {i.error && <span>: {i.error}</span>}
          </span>
          {!i.error && (
            <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-blue transition-[width]" style={{ width: `${Math.round(i.progress * 100)}%` }} />
            </span>
          )}
        </li>
      ))}
      {items.some((i) => i.error) && (
        <li>
          <button type="button" onClick={onClear} className="text-[12.5px] font-medium text-ink-2 hover:text-ink">
            Uyarıları temizle
          </button>
        </li>
      )}
    </ul>
  )
}

function Lightbox({ photos, index, onIndex, onClose, title }: { photos: VehiclePhoto[]; index: number; onIndex: (i: number) => void; onClose: () => void; title: string }) {
  const p = photos[index]!
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onIndex((index + 1) % photos.length)
      if (e.key === 'ArrowLeft') onIndex((index - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, photos.length, onIndex])
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink/92" />
        <Dialog.Content className="fixed inset-0 z-[61] grid place-items-center p-6 outline-none" onClick={onClose}>
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <img src={p.url} alt={title} className="max-h-[calc(100dvh-128px)] max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
          <Dialog.Close aria-label="Kapat" className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-ink/70 text-white ring-1 ring-white/25 hover:bg-ink">
            <X size={18} />
          </Dialog.Close>
          <span className="tnum absolute bottom-6 left-1/2 -translate-x-1/2 text-[13px] text-white/85">
            {p.isPrimary ? 'Ana fotoğraf' : 'Tanıtım fotoğrafı'} · {index + 1} / {photos.length}
          </span>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Araç 360° photo area (V5): large stage, thumbnail strip, upload and management for permitted users. */
export function VehicleGallery({ v, canManage }: { v: VehicleDetail; canManage: boolean }) {
  const session = useSession()
  const q = useQuery({ queryKey: ['vehicle-photos', session.company?.id, v.id], queryFn: () => photosApi.list(v.id) })
  const photos = q.data?.items ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(false)
  const [manage, setManage] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const uploader = useUploader(v.id, photos.length)

  const index = Math.max(
    0,
    photos.findIndex((p) => (selectedId ? p.id === selectedId : p.isPrimary)),
  )
  const current = photos[index]
  const canAdd = canManage && photos.length < MAX_PROMO_PHOTOS
  const step = (d: number) => photos.length && setSelectedId(photos[(index + d + photos.length) % photos.length]!.id)
  const title = `${v.make} ${v.model}`

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (canAdd && e.dataTransfer.files.length) void uploader.start(e.dataTransfer.files)
  }
  const dropProps = canAdd
    ? {
        onDragOver: (e: DragEvent) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            setDragOver(true)
          }
        },
        onDragLeave: () => setDragOver(false),
        onDrop,
      }
    : {}

  return (
    <div className="min-w-0">
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void uploader.start(e.target.files)
          e.target.value = ''
        }}
      />

      {q.isPending ? (
        <div className="aspect-[16/9] animate-pulse rounded-[14px] bg-line-soft lg:aspect-[16/10]" aria-busy="true" aria-label="Fotoğraflar yükleniyor" />
      ) : current ? (
        <div
          {...dropProps}
          className={cn(
            'group/stage relative overflow-hidden rounded-[14px] bg-[#dfe2e7] shadow-[0_1px_2px_rgb(16_24_40/0.06),0_12px_32px_-18px_rgb(16_24_40/0.35)]',
            dragOver && 'ring-2 ring-blue ring-offset-2',
          )}
        >
          <img key={current.id} src={current.url} alt={`${title}, tanıtım fotoğrafı ${index + 1}`} className="aspect-[16/9] w-full animate-fade object-cover lg:aspect-[16/10]" />
          <span className="absolute bottom-3 left-3 rounded-md bg-surface/92 px-2.5 py-1 text-[12px] font-medium text-ink backdrop-blur-sm">
            {current.isPrimary ? 'Ana fotoğraf' : 'Tanıtım fotoğrafı'}
            <span className="tnum font-normal text-ink-2"> · {index + 1}/{photos.length}</span>
          </span>
          <button
            type="button"
            onClick={() => setZoom(true)}
            aria-label="Fotoğrafı büyüt"
            className="absolute right-3 bottom-3 grid size-9 place-items-center rounded-lg bg-surface/92 text-ink opacity-0 backdrop-blur-sm transition-opacity group-hover/stage:opacity-100 focus-visible:opacity-100"
          >
            <ArrowsOutSimple size={16} />
          </button>
          {photos.length > 1 && (
            <>
              <button type="button" aria-label="Önceki fotoğraf" onClick={() => step(-1)} className="absolute top-1/2 left-3 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-surface/92 text-ink opacity-0 transition-opacity group-hover/stage:opacity-100 focus-visible:opacity-100">
                <CaretLeft size={16} />
              </button>
              <button type="button" aria-label="Sonraki fotoğraf" onClick={() => step(1)} className="absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-surface/92 text-ink opacity-0 transition-opacity group-hover/stage:opacity-100 focus-visible:opacity-100">
                <CaretRight size={16} />
              </button>
            </>
          )}
          {dragOver && <div className="absolute inset-0 grid place-items-center bg-blue/15 font-medium text-blue-ink">Bırakın, yüklensin</div>}
        </div>
      ) : (
        <div
          {...dropProps}
          className={cn(
            'relative grid aspect-[16/7] place-items-center overflow-hidden rounded-[14px] border border-line bg-[radial-gradient(120%_80%_at_50%_100%,#e6e9ef_0%,#f3f4f7_55%,#f7f8fa_100%)] lg:aspect-[16/10]',
            dragOver && 'border-blue ring-2 ring-blue/30',
          )}
        >
          <div className="relative px-6 text-center">
            <CarProfile weight="thin" className="mx-auto size-16 text-ink-3/70 lg:size-28" aria-hidden />
            <p className="mt-1 font-semibold text-ink">Tanıtım fotoğrafı yok</p>
            {canManage ? (
              <>
                <p className="mt-1 text-[13px] text-ink-2">Fotoğraf seçin ya da buraya sürükleyin.</p>
                <button type="button" onClick={() => input.current?.click()} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-blue px-3.5 font-medium text-white hover:bg-blue-ink">
                  <UploadSimple size={16} />
                  Fotoğraf ekle
                </button>
              </>
            ) : (
              <p className="mt-1 text-[13px] text-ink-2">Fotoğraf eklenmemiş.</p>
            )}
          </div>
        </div>
      )}

      {(photos.length > 0 || canManage) && (
        <div className="mt-3 grid grid-cols-6 gap-2">
          {photos.map((p, i) => {
            const on = i === index
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                aria-pressed={on}
                aria-label={`${p.isPrimary ? 'Ana fotoğraf' : `Fotoğraf ${i + 1}`}`}
                className="group/t block min-w-0 text-left"
              >
                <span className={cn('block overflow-hidden rounded-lg ring-offset-2 ring-offset-surface transition', on ? 'ring-2 ring-blue' : 'ring-1 ring-line group-hover/t:ring-ink-3')}>
                  <img src={p.thumbUrl} alt="" loading="lazy" className={cn('aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover/t:scale-[1.04]', !on && 'opacity-90')} />
                </span>
                <span className={cn('mt-1 block truncate text-[11.5px]', on ? 'font-medium text-ink' : 'text-ink-2')}>{p.isPrimary ? 'Ana' : `${i + 1}`}</span>
              </button>
            )
          })}
          {canAdd &&
            uploader.items
              .filter((u) => !u.error)
              .map((u) => (
                <span key={u.key} className="block min-w-0">
                  <span className="grid aspect-[4/3] place-items-center rounded-lg border border-line bg-ground">
                    <span className="h-1 w-3/4 overflow-hidden rounded-full bg-line">
                      <span className="block h-full bg-blue transition-[width]" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-[11.5px] text-ink-2">{u.progress > 0 ? 'Yükleniyor' : 'Sırada'}</span>
                </span>
              ))}
          {canAdd && photos.length + uploader.items.filter((u) => !u.error && u.progress < 1).length < MAX_PROMO_PHOTOS && (
            <button type="button" onClick={() => input.current?.click()} disabled={uploader.busy} className="group/a block min-w-0 text-left disabled:opacity-60" aria-label="Fotoğraf ekle">
              <span className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-ink-3/40 bg-surface text-ink-2 transition-colors group-hover/a:border-blue group-hover/a:text-blue">
                <Plus size={18} />
              </span>
              <span className="mt-1 block text-[11.5px] text-ink-2">Ekle</span>
            </button>
          )}
        </div>
      )}

      <UploadStatus items={uploader.items.filter((i) => i.error)} onClear={uploader.clear} />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={13} weight="fill" className="text-blue" />
          Teslim ve iade kanıt fotoğrafları ayrı tutulur.
        </span>
        {canManage && photos.length > 0 && (
          <button type="button" onClick={() => setManage(true)} className="inline-flex items-center gap-1 font-medium text-blue hover:underline">
            Fotoğrafları yönet <span className="tnum text-ink-2">· {photos.length}/{MAX_PROMO_PHOTOS}</span>
          </button>
        )}
      </div>

      {zoom && current && <Lightbox photos={photos} index={index} onIndex={(i) => setSelectedId(photos[i]!.id)} onClose={() => setZoom(false)} title={title} />}
      {manage && q.data && <ManageDialog v={v} list={q.data} uploader={uploader} onPick={() => input.current?.click()} onClose={() => setManage(false)} />}
    </div>
  )
}

function ManageDialog({
  v,
  list,
  uploader,
  onPick,
  onClose,
}: {
  v: VehicleDetail
  list: VehiclePhotoList
  uploader: ReturnType<typeof useUploader>
  onPick: () => void
  onClose: () => void
}) {
  const session = useSession()
  const qc = useQueryClient()
  const key = ['vehicle-photos', session.company?.id, v.id]
  const photos = list.items
  const [dragId, setDragId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const apply = (data: VehiclePhotoList) => {
    qc.setQueryData(key, data)
    void qc.invalidateQueries({ queryKey: ['vehicle-activity'] })
  }
  const onError = (e: unknown) => {
    setError(e instanceof ApiRequestError ? e.message : 'İşlem tamamlanamadı.')
    void qc.invalidateQueries({ queryKey: key })
  }
  const reorder = useMutation({
    mutationFn: (ids: string[]) => photosApi.reorder(v.id, ids),
    onMutate: (ids) => {
      setError(null)
      const prev = qc.getQueryData<VehiclePhotoList>(key)
      if (prev) qc.setQueryData(key, { ...prev, items: ids.map((id, i) => ({ ...prev.items.find((p) => p.id === id)!, position: i })) })
    },
    onSuccess: apply,
    onError,
  })
  const primary = useMutation({ mutationFn: (id: string) => photosApi.makePrimary(v.id, id), onMutate: () => setError(null), onSuccess: (d) => (apply(d), toast('Ana fotoğraf değiştirildi.')), onError })
  const remove = useMutation({
    mutationFn: (id: string) => photosApi.remove(v.id, id),
    onMutate: () => setError(null),
    onSuccess: (d) => {
      apply(d)
      setConfirmId(null)
      toast('Fotoğraf kaldırıldı.')
    },
    onError,
  })
  const pending = reorder.isPending || primary.isPending || remove.isPending

  const move = (id: string, d: number) => {
    const ids = photos.map((p) => p.id)
    const i = ids.indexOf(id)
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
    reorder.mutate(ids)
  }
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const ids = photos.map((p) => p.id).filter((id) => id !== dragId)
    ids.splice(ids.indexOf(targetId) + (photos.findIndex((p) => p.id === dragId) < photos.findIndex((p) => p.id === targetId) ? 1 : 0), 0, dragId)
    setDragId(null)
    reorder.mutate(ids)
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[860px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-surface shadow-xl outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <Dialog.Title className="text-[17px] font-semibold">Tanıtım fotoğrafları</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[13px] text-ink-2">
                {v.plate} · {photos.length}/{MAX_PROMO_PHOTOS} fotoğraf. Sürükleyerek veya oklarla sıralayın. Ana fotoğraf, araç sayfasında ilk gösterilendir.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Kapat" className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-ground hover:text-ink">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {error && (
              <p role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-alert/25 bg-alert-soft px-3 py-2 text-[13px] text-alert">
                <WarningCircle size={16} />
                {error}
              </p>
            )}
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((p, i) => (
                <li
                  key={p.id}
                  draggable={!pending}
                  onDragStart={() => setDragId(p.id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => dragId && e.preventDefault()}
                  onDrop={() => dropOn(p.id)}
                  className={cn('overflow-hidden rounded-lg border bg-surface transition', dragId === p.id ? 'border-blue opacity-50' : 'border-line', p.isPrimary && 'ring-1 ring-ink')}
                >
                  <div className="relative">
                    <img src={p.thumbUrl} alt={`Fotoğraf ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                    <span className="tnum absolute top-2 left-2 grid size-6 place-items-center rounded bg-surface/92 text-[12px] font-semibold text-ink">{i + 1}</span>
                    <span className="absolute top-2 right-2 grid size-6 cursor-grab place-items-center rounded bg-surface/92 text-ink-2" aria-hidden>
                      <DotsSixVertical size={14} weight="bold" />
                    </span>
                    {p.isPrimary && (
                      <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-ink px-1.5 py-0.5 text-[11.5px] font-medium text-white">
                        <Star size={11} weight="fill" /> Ana fotoğraf
                      </span>
                    )}
                  </div>
                  {confirmId === p.id ? (
                    <div className="flex items-center justify-between gap-2 bg-alert-soft px-3 py-2 text-[13px]">
                      <span className="font-medium text-alert">Kaldırılsın mı?</span>
                      <span className="flex gap-1.5">
                        <button type="button" onClick={() => setConfirmId(null)} className="h-8 rounded-md border border-line bg-surface px-2.5 font-medium">
                          Vazgeç
                        </button>
                        <button type="button" disabled={remove.isPending} onClick={() => remove.mutate(p.id)} className="h-8 rounded-md bg-alert px-2.5 font-medium text-white disabled:opacity-60">
                          Kaldır
                        </button>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <button type="button" aria-label={`Fotoğraf ${i + 1} sola`} disabled={i === 0 || pending} onClick={() => move(p.id, -1)} className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-ink disabled:opacity-35">
                        <ArrowLeft size={15} />
                      </button>
                      <button type="button" aria-label={`Fotoğraf ${i + 1} sağa`} disabled={i === photos.length - 1 || pending} onClick={() => move(p.id, 1)} className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-ground hover:text-ink disabled:opacity-35">
                        <ArrowRight size={15} />
                      </button>
                      {!p.isPrimary && (
                        <button type="button" disabled={pending} onClick={() => primary.mutate(p.id)} className="ml-1 h-8 rounded-md px-2 text-[13px] font-medium text-blue hover:bg-blue-soft disabled:opacity-50">
                          Ana yap
                        </button>
                      )}
                      <button type="button" aria-label={`Fotoğraf ${i + 1} kaldır`} disabled={pending} onClick={() => setConfirmId(p.id)} className="ml-auto grid size-8 place-items-center rounded-md text-ink-2 hover:bg-alert-soft hover:text-alert disabled:opacity-35">
                        <Trash size={15} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {photos.length < MAX_PROMO_PHOTOS && (
                <li>
                  <button
                    type="button"
                    onClick={onPick}
                    disabled={uploader.busy}
                    className="grid h-full min-h-[180px] w-full place-items-center rounded-lg border border-dashed border-ink-3/40 text-ink-2 transition-colors hover:border-blue hover:text-blue disabled:opacity-60"
                  >
                    <span className="text-center">
                      {uploader.busy ? <SpinnerGap size={22} className="mx-auto animate-spin" /> : <ImageSquare size={22} className="mx-auto" />}
                      <span className="mt-2 block font-medium">{uploader.busy ? 'Yükleniyor' : 'Fotoğraf ekle'}</span>
                      <span className="mt-0.5 block text-[12px] text-ink-3">JPEG, PNG, WebP · en fazla {MAX_PHOTO_MB} MB</span>
                    </span>
                  </button>
                </li>
              )}
            </ol>
            <UploadStatus items={uploader.items} onClear={uploader.clear} />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-3 text-[12.5px] text-ink-2">
            <span>Konum ve kamera bilgileri yüklemede silinir. Değişiklikler hemen kaydedilir.</span>
            <Dialog.Close className="h-9 rounded-lg border border-line px-3.5 font-medium text-ink hover:bg-ground">Kapat</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
