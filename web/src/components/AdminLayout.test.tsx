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
        <Route path="/sign-in" element={<div>Sign in</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  useAuthStore.setState({ user: null } as never)
})

describe('AdminLayout officer gate', () => {
  it('sends an officer opening /admin/users back to /admin', async () => {
    setUser('chapter_officer')
    renderAt('/admin/users')
    expect(await screen.findByText('Admin index')).toBeInTheDocument()
    expect(screen.queryByText('Users page')).toBeNull()
  })

  it('sends an officer opening /admin/events back to /admin', async () => {
    setUser('chapter_officer')
    renderAt('/admin/events')
    expect(await screen.findByText('Admin index')).toBeInTheDocument()
    expect(screen.queryByText('Events page')).toBeNull()
  })

  it('shows an officer only the standings entry under a Chapter officer tag', async () => {
    setUser('chapter_officer')
    renderAt('/admin')
    expect(await screen.findByText('Chapter officer')).toBeInTheDocument()
    expect(screen.getByText('Chapter Standings')).toBeInTheDocument()
    expect(screen.queryByText('Users')).toBeNull()
    expect(screen.queryByText('Events')).toBeNull()
    expect(screen.getByText('Back to App')).toBeInTheDocument()
    expect(screen.getByText('Sign Out')).toBeInTheDocument()
  })

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
