# Terraform: main app infrastructure

This root module models cloud resources used by the Next.js app in [`com.order332.app`](../../com.order332.app/): **Supabase** (Postgres + API keys), **Cloudflare R2** (WebPC disk images), and **Vercel** (project + environment variables).

## Out of scope (by design)

- **Standalone Astro blog site** — Terraform does not host it, create its repo, or run its build. You manage that stack separately.
- **GitHub / website repo** — Terraform does not create the repository, PAT permissions, or Astro source tree. For production you still need `GITHUB_TOKEN`, `GITHUB_BLOG_REPO`, `GITHUB_BLOG_BRANCH`, and `GITHUB_BLOG_PATH` on Vercel so the in-app blog CMS can commit to the website repo; pass them via the `github_blog_cms` object in `terraform.tfvars` (all four together, or leave all empty if the CMS is unused).
- **Supabase Storage bucket `blog-images`** — not created here; the app can create it at runtime or you manage it in Supabase if you use the CMS.

## Cron jobs

Scheduled cleanup is defined in the app’s [`vercel.json`](../../com.order332.app/vercel.json) (`GET /api/cron/cleanup`). Terraform does not duplicate that definition; ensure `CRON_SECRET` is set (via `app_secrets.cron_secret`) so Vercel can authenticate cron requests.

## Prerequisites

1. **Vercel** — API token (`VERCEL_API_TOKEN`). For team projects, set `vercel_team_id`.
2. **Cloudflare** — API token with permission to manage R2 (`CLOUDFLARE_API_TOKEN`).
3. **Supabase** — account access token (`SUPABASE_ACCESS_TOKEN`).
4. **Database URL** — Supabase **transaction** pooler URI for `DATABASE_URL` (see [`com.order332.app/.env.local.example`](../../com.order332.app/.env.local.example)). Terraform does not construct this string because the host depends on region and credentials.

## R2 S3 credentials

Terraform creates the **bucket** (`cloudflare_r2_bucket`). **S3-compatible Access Key ID and Secret** are created in the Cloudflare Dashboard under **R2 → Manage R2 API Tokens** and passed in as `r2_access_key_id` / `r2_secret_access_key`. Until both are set, WebPC-related env vars are not pushed to Vercel.

## Usage

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars

export VERCEL_API_TOKEN=...
export CLOUDFLARE_API_TOKEN=...
export SUPABASE_ACCESS_TOKEN=...

terraform init
terraform plan
terraform apply
```

Use a **remote backend** for state (uncomment and edit `backend` in `versions.tf`).

## Supabase: new vs existing project

- **Existing project:** `create_supabase_project = false` and set `supabase_project_ref` (from the dashboard URL).
- **New project:** `create_supabase_project = true`, set `supabase_organization_id`, and optionally adjust `supabase_project_name` / `supabase_region`. After the first apply, copy `DATABASE_URL` from the Supabase dashboard into `terraform.tfvars` if it was not known upfront, then apply again so Vercel gets the variable.

### Bootstrap order (new Supabase + Vercel env)

`DATABASE_URL` is not emitted by this module. For a **new** Supabase project, you usually:

1. Apply with `create_supabase_project = true` and `manage_vercel_environment = false` (or omit `database_url` by turning off Vercel env management until you have it).
2. Copy the **transaction pooler** URI from the Supabase dashboard into `terraform.tfvars` as `database_url`.
3. Set `manage_vercel_environment = true` and apply again so Vercel receives `DATABASE_URL` and the rest.

For **existing** Supabase projects, set `create_supabase_project = false`, fill `supabase_project_ref` and `database_url`, then apply once with `manage_vercel_environment = true` if desired.

## Vercel environment variables

`vercel_project_environment_variables` owns the **full set** of variables declared in this module. Add new keys by extending `locals.tf` (or variables), not by mixing dashboard-only vars unless you accept drift.

## Manual configuration (not Terraform)

- **Discord OAuth** application (redirect URI must match `DISCORD_REDIRECT_URI`).
- **BotID** / Vercel integration as needed for `botid` in the app.
- **Passkeys / `NEXT_PUBLIC_APP_URL`** — must match the live origin (see app README).
