check "supabase_project_ref" {
  assert {
    condition = var.create_supabase_project ? (
      var.supabase_organization_id != ""
      ) : (
      !var.manage_vercel_environment || var.supabase_project_ref != ""
    )
    error_message = "Either set create_supabase_project with supabase_organization_id, or set supabase_project_ref when using an existing project (required if manage_vercel_environment is true)."
  }
}

check "vercel_project_id" {
  assert {
    condition     = !var.manage_vercel_environment || var.create_vercel_project || var.vercel_existing_project_id != ""
    error_message = "When manage_vercel_environment is true and create_vercel_project is false, set vercel_existing_project_id."
  }
}

check "database_url_for_vercel" {
  assert {
    condition     = !var.manage_vercel_environment || var.database_url != ""
    error_message = "database_url is required when manage_vercel_environment is true (Supabase pooler URI for migrations)."
  }
}

check "cloudflare_account_for_r2" {
  assert {
    condition     = !var.create_r2_bucket || var.cloudflare_account_id != ""
    error_message = "cloudflare_account_id is required when create_r2_bucket is true."
  }
}

# Blog CMS: all four GitHub-related values must be set together, or all left empty (see github_blog_cms in variables.tf).
check "github_blog_cms_all_or_nothing" {
  assert {
    condition = !var.manage_vercel_environment || (
      (var.github_blog_cms.token == "" && var.github_blog_cms.repo == "" && var.github_blog_cms.branch == "" && var.github_blog_cms.path == "") ||
      (var.github_blog_cms.token != "" && var.github_blog_cms.repo != "" && var.github_blog_cms.branch != "" && var.github_blog_cms.path != "")
    )
    error_message = "github_blog_cms: set token, repo, branch, and path together, or leave all empty if you do not use the blog CMS."
  }
}
