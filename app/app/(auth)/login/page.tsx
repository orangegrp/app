import { Suspense } from 'react'
import { LoginBackground } from '@/components/auth/LoginBackground'
import { LoginCard } from '@/components/auth/LoginCard'

export default function LoginPage() {
  return (
    <LoginBackground>
      <Suspense fallback={<div className="glass-card mx-auto min-h-[320px] w-full max-w-sm rounded-3xl" aria-hidden />}>
        <LoginCard />
      </Suspense>
    </LoginBackground>
  )
}
