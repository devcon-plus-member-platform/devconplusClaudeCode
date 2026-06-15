import type { Variants } from 'framer-motion'

/** Fade + subtle slide up — for page entrances and card lists */
export const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.15, ease: 'easeIn' } },
}

/** Simple opacity fade — for page-level transitions */
export const fade: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.18 } },
  exit:    { opacity: 0, transition: { duration: 0.12 } },
}

/** Slide up from bottom — for sheets / modals */
export const slideUp: Variants = {
  hidden:  { opacity: 0, y: '100%' },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } },
  exit:    { opacity: 0, y: '100%', transition: { duration: 0.2, ease: 'easeIn' } },
}

/** Fade-in backdrop */
export const backdrop: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.18, delay: 0.05 } },
}

/** Container for staggered children */
export const staggerContainer: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
}

/** Individual staggered card / list item */
export const cardItem: Variants = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
}

/** Spring config for the nav tab sliding indicator */
export const NAV_SPRING = { type: 'spring', stiffness: 380, damping: 28 } as const
