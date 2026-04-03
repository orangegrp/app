# -----------------------------------------------------------------------------
# Supabase
# -----------------------------------------------------------------------------

variable "create_supabase_project" {
  type        = bool
  description = "If true, create a new Supabase project. If false, use supabase_project_ref for an existing project (import or already-created)."
  default     = false
}

variable "supabase_organization_id" {
  type        = string
  description = "Supabase organization slug (required when create_supabase_project is true)."
  default     = ""
}

variable "supabase_project_name" {
  type        = string
  description = "Display name for a new Supabase project."
  default     = "order332-app"
}

variable "supabase_region" {
  type        = string
  description = "Supabase project region (e.g. us-east-1, eu-west-1)."
  default     = "us-east-1"
}

variable "supabase_instance_size" {
  type        = string
  description = "Supabase instance size (e.g. micro)."
  default     = "micro"
}

variable "supabase_project_ref" {
  type        = string
  description = "Existing Supabase project ref (from dashboard URL). Required when create_supabase_project is false."
  default     = ""
}

# -----------------------------------------------------------------------------
# Cloudflare R2 (WebPC disk images — see com.order332.app/server/lib/webpc-r2.ts)
# -----------------------------------------------------------------------------

variable "create_r2_bucket" {
  type        = bool
  description = "If true, create an R2 bucket via Terraform."
  default     = true
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID (32-char hex). Required when create_r2_bucket is true."
  default     = ""
}

variable "r2_bucket_name" {
  type        = string
  description = "R2 bucket name for WebPC images."
  default     = "order332-webpc-disks"
}

variable "r2_location" {
  type        = string
  description = "R2 bucket location hint (apac, eeur, enam, weur, wnam, oc). Only honored on first creation."
  default     = "wnam"
}

variable "r2_key_prefix" {
  type        = string
  description = "Key prefix inside the bucket (must end with / for app default)."
  default     = "webpc-images/"
}

variable "r2_access_key_id" {
  type        = string
  description = "R2 S3 API Access Key ID (create an R2 API token in Cloudflare Dashboard → R2 → Manage R2 API Tokens). Leave empty to skip R2 env vars on Vercel."
  default     = ""
  sensitive   = true
}

variable "r2_secret_access_key" {
  type        = string
  description = "R2 S3 API secret for r2_access_key_id."
  default     = ""
  sensitive   = true
}

variable "r2_force_path_style" {
  type        = string
  description = "Set to \"false\" only if you use virtual-hosted-style URLs; app default is path-style."
  default     = "true"
}

# -----------------------------------------------------------------------------
# Vercel
# -----------------------------------------------------------------------------

variable "create_vercel_project" {
  type        = bool
  description = "If true, create the Vercel project. If false, set vercel_existing_project_id."
  default     = true
}

variable "vercel_existing_project_id" {
  type        = string
  description = "Existing Vercel project ID when create_vercel_project is false."
  default     = ""
}

variable "vercel_project_name" {
  type        = string
  description = "Vercel project name (URL slug)."
  default     = "order332-app"
}

variable "vercel_team_id" {
  type        = string
  description = "Vercel team ID or slug when the project belongs to a team. Leave empty for personal account."
  default     = ""
}

variable "vercel_git_repository" {
  type = object({
    type = string # github | gitlab | bitbucket
    repo = string # owner/name
  })
  description = "Git connection for automatic deployments. Example: { type = \"github\", repo = \"orangegrp/app\" }."
  default = {
    type = "github"
    repo = "orangegrp/app"
  }
}

variable "vercel_root_directory" {
  type        = string
  description = "Monorepo subdirectory containing the Next.js app."
  default     = "com.order332.app"
}

variable "manage_vercel_environment" {
  type        = bool
  description = "If true, manage environment variables with vercel_project_environment_variables (exclusive with inline project env)."
  default     = true
}

variable "vercel_env_targets" {
  type        = list(string)
  description = "Vercel targets for managed env vars (production, preview, development)."
  default     = ["production", "preview"]
}

variable "database_url" {
  type        = string
  description = "Supabase Postgres pooler URI (transaction mode) for migrations — see com.order332.app/.env.local.example. Required when manage_vercel_environment is true."
  default     = ""
  sensitive   = true
}

# In-app blog CMS (GitHub-backed markdown in the Astro website repo). Terraform only passes these to Vercel; it does
# not create the repo, PAT, or deploy the standalone Astro site — those must exist separately.
variable "github_blog_cms" {
  type = object({
    token  = string # GITHUB_TOKEN — fine-grained PAT with Contents on the website repo
    repo   = string # GITHUB_BLOG_REPO — owner/repo
    branch = string # GITHUB_BLOG_BRANCH
    path   = string # GITHUB_BLOG_PATH — path to blog content in that repo
  })
  description = "Blog CMS env values for Vercel. Leave all fields empty if you do not use the dashboard blog editor."
  sensitive   = true
  default = {
    token  = ""
    repo   = ""
    branch = ""
    path   = ""
  }
}

# Application secrets for Vercel (everything the app needs except Supabase keys from the API and infra-derived URLs).
variable "app_secrets" {
  type = object({
    jwt_secret              = string
    jwt_refresh_secret      = string
    discord_link_secret     = string
    qr_encryption_key       = string
    discord_client_id       = string
    discord_client_secret   = string
    discord_redirect_uri    = string
    bot_secret              = string
    cron_secret             = string
    next_public_app_url     = string
    next_public_app_version = optional(string)
  })
  description = "Sensitive values mirrored from com.order332.app/.env.local.example (excluding GitHub blog CMS — see github_blog_cms)."
  sensitive   = true
  default = {
    jwt_secret              = ""
    jwt_refresh_secret      = ""
    discord_link_secret     = ""
    qr_encryption_key       = ""
    discord_client_id       = ""
    discord_client_secret   = ""
    discord_redirect_uri    = ""
    bot_secret              = ""
    cron_secret             = ""
    next_public_app_url     = ""
    next_public_app_version = null
  }
}
