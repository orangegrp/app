resource "random_password" "supabase_db" {
  count   = var.create_supabase_project ? 1 : 0
  length  = 32
  special = false
}

resource "supabase_project" "main" {
  count = var.create_supabase_project ? 1 : 0

  organization_id   = var.supabase_organization_id
  name              = var.supabase_project_name
  database_password = random_password.supabase_db[0].result
  region            = var.supabase_region
  instance_size     = var.supabase_instance_size

  lifecycle {
    ignore_changes = [database_password]
  }
}

data "supabase_apikeys" "main" {
  count = var.manage_vercel_environment ? 1 : 0

  project_ref = local.supabase_project_ref
}
