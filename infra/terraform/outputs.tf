output "supabase_project_ref" {
  description = "Supabase project reference (subdomain id)."
  value       = local.supabase_project_ref
}

output "supabase_url" {
  description = "Supabase API base URL."
  value       = local.supabase_url
}

output "r2_bucket_name" {
  description = "R2 bucket name when create_r2_bucket is true."
  value       = var.create_r2_bucket ? cloudflare_r2_bucket.webpc[0].name : null
}

output "vercel_project_id" {
  description = "Vercel project id (for CLI or dashboard)."
  value       = local.vercel_project_id != "" ? local.vercel_project_id : null
}

output "vercel_project_name" {
  description = "Configured Vercel project name."
  value       = var.vercel_project_name
}
