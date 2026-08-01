import MaintenanceShell from '../components/MaintenanceShell'
import { MAINTENANCE_CONFIG } from '../lib/maintenance'

/**
 * Always-on preview of the maintenance screen at /maintenance-preview.
 *
 * Lets the team review copy and layout without taking the app offline. Lazy-loaded
 * from router.tsx, so it stays in its own chunk and costs members nothing.
 */
export default function MaintenancePreview() {
  return <MaintenanceShell {...MAINTENANCE_CONFIG} />
}
