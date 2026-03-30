import 'server-only'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'

const DEFAULT_APP_URL = 'http://localhost:3000'

function parseAppUrlForWebAuthn(raw: string | undefined): { origin: string; hostname: string } {
  const fallback = new URL(DEFAULT_APP_URL)
  const trimmed = raw?.trim()
  if (!trimmed) {
    return { origin: fallback.origin, hostname: fallback.hostname }
  }
  try {
    const u = new URL(trimmed)
    return { origin: u.origin, hostname: u.hostname }
  } catch {
    return { origin: fallback.origin, hostname: fallback.hostname }
  }
}

export function getRpConfig(): { rpID: string; rpName: string; origin: string } {
  const { origin, hostname } = parseAppUrlForWebAuthn(process.env.NEXT_PUBLIC_APP_URL)
  return {
    rpID: hostname,
    rpName: '332 Home',
    origin,
  }
}

export async function createRegistrationOptions(params: {
  userId: string
  userName: string
  existingCredentialIds: string[]
}): Promise<{ options: Awaited<ReturnType<typeof generateRegistrationOptions>>; challenge: string }> {
  const { rpID, rpName } = getRpConfig()

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(params.userId),
    userName: params.userName,
    attestationType: 'none',
    excludeCredentials: params.existingCredentialIds.map((id) => ({
      id,
      type: 'public-key' as const,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  return { options, challenge: options.challenge }
}

export async function verifyRegistration(params: {
  response: Parameters<typeof verifyRegistrationResponse>[0]['response']
  expectedChallenge: string
}): Promise<VerifiedRegistrationResponse> {
  const { rpID, origin } = getRpConfig()
  return verifyRegistrationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  })
}

export async function createAuthenticationOptions(): Promise<{
  options: Awaited<ReturnType<typeof generateAuthenticationOptions>>
  challenge: string
}> {
  const { rpID } = getRpConfig()
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [],
    userVerification: 'preferred',
  })
  return { options, challenge: options.challenge }
}

export async function verifyAuthentication(params: {
  response: Parameters<typeof verifyAuthenticationResponse>[0]['response']
  expectedChallenge: string
  credential: {
    id: string
    publicKey: string  // base64url stored in DB
    counter: number
    transports?: string  // JSON array string from DB
  }
}): Promise<VerifiedAuthenticationResponse> {
  const { rpID, origin } = getRpConfig()
  const transports: AuthenticatorTransportFuture[] | undefined = params.credential.transports
    ? JSON.parse(params.credential.transports)
    : undefined

  return verifyAuthenticationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: params.credential.id,
      publicKey: Buffer.from(params.credential.publicKey, 'base64url'),
      counter: params.credential.counter,
      transports,
    },
    requireUserVerification: true,
  })
}
