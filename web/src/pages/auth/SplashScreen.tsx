import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/useAuthStore'
import { hasSeenOnboarding } from '../../lib/onboarding'
import AppLoader from '../../components/AppLoader'

export default function SplashScreen() {
  const navigate = useNavigate()

  useEffect(() => {
    const navTimer = setTimeout(() => {
      const { user, isInitialized } = useAuthStore.getState()
      let dest = '/onboarding'
      if (isInitialized && user) dest = '/home'
      else if (hasSeenOnboarding()) dest = '/events'
      navigate(dest, { replace: true })
    }, 2600)

    return () => clearTimeout(navTimer)
  }, [navigate])

  return <AppLoader />
}
