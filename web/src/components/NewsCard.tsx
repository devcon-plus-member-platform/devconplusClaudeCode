import { memo } from 'react'
import { DocumentTextOutline } from 'solar-icon-set'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { NewsPost } from '@devcon-plus/supabase'
import PromotedBadge from './PromotedBadge'
import { formatDate } from '../lib/dates'

function NewsCard({ post }: { post: NewsPost }) {
  const navigate = useNavigate()
  const dateStr = post.created_at ? formatDate.short(post.created_at) : ''

  return (
    <motion.div
      className="bg-white rounded-2xl shadow-card overflow-hidden relative cursor-pointer"
      onClick={() => navigate(`/news/${post.id}`)}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {post.is_promoted && (
        <div className="absolute top-3 right-3 z-10">
          <PromotedBadge />
        </div>
      )}
      {post.cover_image_url ? (
        <img src={post.cover_image_url} alt={post.title} className="w-full h-32 object-cover" />
      ) : (
        <div className="w-full h-32 bg-primary flex items-center justify-center">
          <DocumentTextOutline className="w-10 h-10" color="rgba(255,255,255,0.2)" />
        </div>
      )}
      <div className="p-3">
        <p className="text-md3-label-md text-slate-400 mb-1">{dateStr}</p>
        <p className="font-semibold text-slate-900 text-md3-body-md leading-tight">{post.title}</p>
      </div>
    </motion.div>
  )
}

export default memo(NewsCard)
