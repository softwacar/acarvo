import { useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from '@/app/Sidebar'
import { VehiclesPage } from '@/features/vehicles/VehiclesPage'

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-svh overflow-hidden">
        <Sidebar active="Araçlar" mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <VehiclesPage onMenu={() => setMenuOpen(true)} />
      </div>
    </TooltipProvider>
  )
}
