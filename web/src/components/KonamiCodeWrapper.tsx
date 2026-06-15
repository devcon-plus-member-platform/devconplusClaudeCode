import { useAuthStore } from '../stores/useAuthStore'
import KonamiModal from './KonamiModal'
import { useKonamiCode } from '../hooks/useKonamiCode'

export default function KonamiCodeWrapper() {
  const { user } = useAuthStore()
  const { triggered, reset } = useKonamiCode()

  const isAdmin = user?.role === 'hq_admin' || user?.role === 'super_admin'
  if (!isAdmin) return null

  return <KonamiModal open={triggered} onClose={reset} />
}
