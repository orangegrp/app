locals {
  supabase_project_ref = var.create_supabase_project ? supabase_project.main[0].id : var.supabase_project_ref

  supabase_url = "https://${local.supabase_project_ref}.supabase.co"

  vercel_project_id = var.create_vercel_project ? vercel_project.app[0].id : var.vercel_existing_project_id

  r2_env_enabled = var.create_r2_bucket && var.r2_access_key_id != "" && var.r2_secret_access_key != ""

  github_blog_env_enabled = (
    var.github_blog_cms.token != "" &&
    var.github_blog_cms.repo != "" &&
    var.github_blog_cms.branch != "" &&
    var.github_blog_cms.path != ""
  )

  vercel_env_variables = var.manage_vercel_environment ? concat(
    [
      {
        key       = "SUPABASE_URL"
        value     = local.supabase_url
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "NEXT_PUBLIC_SUPABASE_URL"
        value     = local.supabase_url
        target    = var.vercel_env_targets
        sensitive = false
      },
      {
        key       = "SUPABASE_SERVICE_ROLE_KEY"
        value     = data.supabase_apikeys.main[0].service_role_key
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "SUPABASE_ANON_KEY"
        value     = data.supabase_apikeys.main[0].anon_key
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        value     = data.supabase_apikeys.main[0].anon_key
        target    = var.vercel_env_targets
        sensitive = false
      },
      {
        key       = "DATABASE_URL"
        value     = var.database_url
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "JWT_SECRET"
        value     = var.app_secrets.jwt_secret
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "JWT_REFRESH_SECRET"
        value     = var.app_secrets.jwt_refresh_secret
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "DISCORD_LINK_SECRET"
        value     = var.app_secrets.discord_link_secret
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "QR_ENCRYPTION_KEY"
        value     = var.app_secrets.qr_encryption_key
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "DISCORD_CLIENT_ID"
        value     = var.app_secrets.discord_client_id
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "DISCORD_CLIENT_SECRET"
        value     = var.app_secrets.discord_client_secret
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "DISCORD_REDIRECT_URI"
        value     = var.app_secrets.discord_redirect_uri
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "BOT_SECRET"
        value     = var.app_secrets.bot_secret
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "CRON_SECRET"
        value     = var.app_secrets.cron_secret
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "NEXT_PUBLIC_APP_URL"
        value     = var.app_secrets.next_public_app_url
        target    = var.vercel_env_targets
        sensitive = false
      },
    ],
    local.github_blog_env_enabled ? [
      {
        key       = "GITHUB_TOKEN"
        value     = var.github_blog_cms.token
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "GITHUB_BLOG_REPO"
        value     = var.github_blog_cms.repo
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "GITHUB_BLOG_BRANCH"
        value     = var.github_blog_cms.branch
        target    = var.vercel_env_targets
        sensitive = false
      },
      {
        key       = "GITHUB_BLOG_PATH"
        value     = var.github_blog_cms.path
        target    = var.vercel_env_targets
        sensitive = false
      },
    ] : [],
    try(coalesce(var.app_secrets.next_public_app_version, ""), "") != "" ? [
      {
        key       = "NEXT_PUBLIC_APP_VERSION"
        value     = var.app_secrets.next_public_app_version
        target    = var.vercel_env_targets
        sensitive = false
      },
    ] : [],
    local.r2_env_enabled ? [
      {
        key       = "R2_ACCOUNT_ID"
        value     = var.cloudflare_account_id
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "R2_ACCESS_KEY_ID"
        value     = var.r2_access_key_id
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "R2_SECRET_ACCESS_KEY"
        value     = var.r2_secret_access_key
        target    = var.vercel_env_targets
        sensitive = true
      },
      {
        key       = "R2_BUCKET_NAME"
        value     = cloudflare_r2_bucket.webpc[0].name
        target    = var.vercel_env_targets
        sensitive = false
      },
      {
        key       = "R2_KEY_PREFIX"
        value     = var.r2_key_prefix
        target    = var.vercel_env_targets
        sensitive = false
      },
      {
        key       = "R2_FORCE_PATH_STYLE"
        value     = var.r2_force_path_style
        target    = var.vercel_env_targets
        sensitive = false
      },
    ] : []
  ) : []
}
