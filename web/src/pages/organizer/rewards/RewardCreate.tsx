import { useNavigate } from 'react-router-dom'
import { RewardForm } from './RewardForm'

export function RewardCreate() {
  const navigate = useNavigate()
  return (
    <RewardForm
      onSuccess={() => navigate('/organizer/rewards')}
    />
  )
}
