'use client'
import Image from 'next/image'
import type { AuthUser } from '@/lib/auth-store'
import { userDisplayName } from '@/lib/user-display'

type UserLike = Pick<AuthUser, 'id' | 'displayName' | 'discordUsername' | 'discordAvatar'>

interface UserAvatarProps {
  user: UserLike | null | undefined
  size: number
  className?: string
  textClassName?: string
}

export function UserAvatar({ user, size, className = '', textClassName = '' }: UserAvatarProps): React.ReactElement {
  const label = user ? userDisplayName(user) : ''
  const initial = label.trim()
    ? label.trim()[0].toUpperCase()
    : user?.id.slice(0, 1).toUpperCase() ?? '?'
  const url = user?.discordAvatar

  const base = [
    'shrink-0 overflow-hidden rounded-full flex items-center justify-center font-medium',
    className,
  ].join(' ')

  if (url) {
    return (
      <Image
        src={url}
        alt={label ? `Avatar — ${label}` : 'Avatar'}
        width={size}
        height={size}
        className={base}
        unoptimized
      />
    )
  }

  return (
    <div
      className={[base, textClassName].join(' ')}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.42)),
        background: 'oklch(1 0 0 / 12%)',
        color: 'oklch(1 0 0 / 80%)',
      }}
      aria-hidden={!label}
    >
      {initial}
    </div>
  )
}
