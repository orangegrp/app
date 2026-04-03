# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the 332 members app. Here is a summary of all changes made:

- **`instrumentation-client.ts`** — PostHog client-side SDK initialized via Next.js 15.3+ `instrumentation-client` convention, with exception capture enabled and a reverse proxy path (`/ingest`).
- **`next.config.mjs`** — Added `/ingest/static/:path*` and `/ingest/:path*` rewrites to proxy PostHog traffic through the app (EU region). Added `skipTrailingSlashRedirect: true`. Added a service worker `NetworkOnly` rule so the PWA does not intercept analytics requests.
- **`lib/posthog-server.ts`** *(new file)* — Singleton `posthog-node` client for server-side event capture in Hono API routes.
- **`.env.local`** — `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` written.

| Event | Description | File |
|---|---|---|
| `login_method_selected` | User switches between login method tabs (passkey, discord, magic, qr) | `components/auth/LoginCard.tsx` |
| `login_completed` | User successfully logs in via passkey (client-side); includes `posthog.identify()` | `components/auth/LoginCard.tsx` |
| `discord_login_initiated` | User clicks Continue with Discord on login screen | `components/auth/LoginCard.tsx` |
| `registration_invite_claimed` | User successfully claims an invite code | `app/(auth)/register/page.tsx` |
| `registration_completed` | New user completes registration via passkey or Discord; includes `posthog.identify()` | `app/(auth)/register/page.tsx` |
| `welcome_wizard_completed` | New user finishes the onboarding welcome wizard | `components/onboarding/WelcomeWizardDialog.tsx` |
| `settings_display_name_saved` | User saves a display name change | `app/(dashboard)/settings/page.tsx` |
| `settings_passkey_added` | User adds a new passkey to their account | `app/(dashboard)/settings/page.tsx` |
| `settings_account_deleted` | User confirms account deletion; followed by `posthog.reset()` | `app/(dashboard)/settings/page.tsx` |
| `vm_session_started` | Virtual machine successfully boots and becomes ready | `components/webpc/VMRunner.tsx` |
| `vm_boot_failed` | Virtual machine fails to boot, captures `boot_stage` and error message | `components/webpc/VMRunner.tsx` |
| `pwa_install_accepted` | User accepts the Android PWA install prompt | `components/pwa/InstallPrompt.tsx` |
| `server_login_completed` | Server-side: session created after successful passkey authentication | `server/routes/auth/passkey.ts` |
| `server_registration_completed` | Server-side: new user account created after completing passkey registration | `server/routes/auth/passkey.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://eu.posthog.com/project/152520/dashboard/601974
  - **Registration funnel: invite claim → completion**: https://eu.posthog.com/project/152520/insights/QNvDg0qn
  - **Onboarding funnel: registration → wizard completed**: https://eu.posthog.com/project/152520/insights/mP6LiGmc
  - **Daily active users (logins)**: https://eu.posthog.com/project/152520/insights/RkomUhOI
  - **VM sessions started vs failed (by machine)**: https://eu.posthog.com/project/152520/insights/eA2pNUXF
  - **Login method popularity**: https://eu.posthog.com/project/152520/insights/DDXKuYk9

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
