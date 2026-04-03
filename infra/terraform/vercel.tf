resource "vercel_project" "app" {
  count = var.create_vercel_project ? 1 : 0

  name           = var.vercel_project_name
  framework      = "nextjs"
  root_directory = var.vercel_root_directory

  git_repository = {
    type = var.vercel_git_repository.type
    repo = var.vercel_git_repository.repo
  }

  team_id = var.vercel_team_id != "" ? var.vercel_team_id : null
}

resource "vercel_project_environment_variables" "app" {
  count = var.manage_vercel_environment ? 1 : 0

  project_id = local.vercel_project_id
  team_id    = var.vercel_team_id != "" ? var.vercel_team_id : null

  variables = [for v in local.vercel_env_variables : {
    key       = v.key
    value     = v.value
    target    = v.target
    sensitive = v.sensitive
  }]
}
