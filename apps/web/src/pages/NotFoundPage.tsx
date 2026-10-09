import { Compass } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { StatePanel } from '@/components/states'

export function NotFoundPage() {
  return (
    <StatePanel icon={Compass} title="Sayfa bulunamadı">
      <p>Aradığınız adres ACARVO menüsünde yok.</p>
      <Link to="/" className="mt-4 inline-flex h-9 items-center rounded-lg border border-line px-3.5 font-medium text-ink hover:bg-ground">
        Ana ekrana dön
      </Link>
    </StatePanel>
  )
}
