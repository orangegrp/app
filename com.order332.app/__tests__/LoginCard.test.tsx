// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { LoginCard } from '../components/auth/LoginCard'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({
    get: vi.fn(() => null),
    toString: () => '',
  }),
}))

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

vi.mock('@/lib/pwa', () => ({ isPWAContext: () => false }))
vi.mock('../lib/pwa', () => ({ isPWAContext: () => false }))

const mockHardNavigateTo = vi.fn()
vi.mock('@/lib/hard-navigation', () => ({
  hardNavigateTo: (url: string) => mockHardNavigateTo(url),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock('@/lib/analytics', () => ({
  capture: vi.fn(),
  captureException: vi.fn(),
  identify: vi.fn(),
}))

describe('LoginCard', () => {
  beforeEach(() => {
    mockHardNavigateTo.mockClear()
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    })
  })

  it('renders without crashing', () => {
    render(<LoginCard />)
    expect(screen.getByText('Members area')).toBeTruthy()
  })

  it('renders the passkey tab as default active', () => {
    render(<LoginCard />)
    expect(screen.getByRole('button', { name: /sign in with passkey/i })).toBeTruthy()
  })

  it('renders Discord tab and shows Discord button when clicked', () => {
    render(<LoginCard />)
    const discordTab = screen.getByRole('button', { name: /discord/i })
    fireEvent.click(discordTab)
    expect(screen.getByRole('button', { name: /continue with discord/i })).toBeTruthy()
  })

  it('navigates to Discord OAuth on Discord button click', () => {
    render(<LoginCard />)
    // click Discord tab
    const discordTab = screen.getAllByRole('button').find((b) => b.textContent?.includes('Discord'))
    if (discordTab) fireEvent.click(discordTab)
    const discordBtn = screen.getByRole('button', { name: /continue with discord/i })
    fireEvent.click(discordBtn)
    expect(mockHardNavigateTo).toHaveBeenCalledWith(expect.stringContaining('/api/auth/discord'))
  })

  it('renders magic link form when Magic Link tab is clicked', () => {
    render(<LoginCard />)
    const magicTab = screen.getAllByRole('button').find((b) => b.textContent?.includes('Magic Link'))
    if (magicTab) fireEvent.click(magicTab)
    expect(screen.getByPlaceholderText(/paste your magic link token/i)).toBeTruthy()
  })

  it('magic link submit button is initially disabled (empty input)', () => {
    render(<LoginCard />)
    const magicTab = screen.getAllByRole('button').find((b) => b.textContent?.includes('Magic Link'))
    if (magicTab) fireEvent.click(magicTab)
    expect(screen.getByRole('button', { name: /verify token/i })).toBeDisabled()
  })

  it('shows register link at the bottom', () => {
    render(<LoginCard />)
    expect(screen.getByText(/new user/i)).toBeTruthy()
  })
})
