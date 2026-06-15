import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeId = 'devcon' | 'she' | 'kids' | 'campus' | 'purple'

export interface ProgramTheme {
  id: ThemeId
  label: string
  hex: string
  darkHex: string
  cssClass: string
  unlockPoints?: number
}

export const PROGRAM_THEMES: ProgramTheme[] = [
  { id: 'devcon', label: 'DEVCON+',       hex: '#1152D4', darkHex: '#0D42AA', cssClass: 'theme-devcon'  },
  { id: 'she',    label: 'She is DEVCON', hex: '#BE185D', darkHex: '#9D174D', cssClass: 'theme-she'     },
  { id: 'kids',   label: 'DEVCON Kids',   hex: '#059669', darkHex: '#047857', cssClass: 'theme-kids'    },
  { id: 'campus', label: 'Campus',        hex: '#D97706', darkHex: '#B45309', cssClass: 'theme-campus'  },
  { id: 'purple', label: 'Elite Purple',  hex: '#7C3AED', darkHex: '#6D28D9', cssClass: 'theme-purple', unlockPoints: 3000 },
]

interface ThemeState {
  themeId: ThemeId
  setTheme: (id: ThemeId) => void
  activeTheme: () => ProgramTheme
  isLocked: (theme: ProgramTheme, lifetimePoints: number) => boolean
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themeId: 'devcon',
      setTheme: (id) => set({ themeId: id }),
      activeTheme: () => PROGRAM_THEMES.find((t) => t.id === get().themeId)!,
      isLocked: (theme, lifetimePoints) => {
        if (!theme.unlockPoints) return false
        return lifetimePoints < theme.unlockPoints
      },
    }),
    { name: 'devcon-theme' },
  ),
)
