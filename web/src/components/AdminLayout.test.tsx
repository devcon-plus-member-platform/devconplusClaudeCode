import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminLayout from './AdminLayout'
import { useAuthStore } from '../stores/useAuthStore'

function setUser(role: string, chapterId: string | null = 'chapter-manila') {
  useAuthStore.setState({
    user: {
      id: 'u-1',
      role,
      username: 'tester',
      chapter_id: chapterId,
      full_name: 'Test User',
      email: 'test@example.com',
    } as unknown as never,
  } as never)
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<div>Admin index</div>} />
          <Route path="/admin/users" element={<div>Users page</div>} />
          <Route path="/admin/events" element={<div>Events page</div>} />
        </Route>
        <Route path="/home" element={<div>Home page</div>} />
        <Route path="/organizer/dashboard" element={<div>Organizer dashboard</div>} />
        <Route path="/sign-in" element={<div>Sign in</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  useAuthStore.setState({ user: null } as never)
})

describe('AdminLayout officer gate', () => {
  it.each(['/admin', '/admin/users', '/admin/events'])(
    'sends an officer opening %s to the read-only organizer dashboard',
    async (path) => {
      setUser('chapter_officer')
      renderAt(path)
      expect(await screen.findByText('Organizer dashboard')).toBeInTheDocument()
      expect(screen.queryByText('Admin index')).toBeNull()
    },
  )

  it('sends a member opening /admin away as today', async () => {
    setUser('member')
    renderAt('/admin')
    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(screen.queryByText('Admin index')).toBeNull()
  })

  it('keeps the HQ dashboard navigation without a standalone standings item', async () => {
    setUser('hq_admin')
    renderAt('/admin')
    expect(await screen.findByText('Admin index')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.queryByText('Standings', { exact: true })).toBeNull()
  })
})
