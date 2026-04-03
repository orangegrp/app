provider "vercel" {
  # Set VERCEL_API_TOKEN in the environment (Vercel account → Tokens).
  # For team-owned projects, set vercel_team_id on the vercel_project resource.
}

provider "cloudflare" {
  # Set CLOUDFLARE_API_TOKEN in the environment (Account → API Tokens).
  # The token needs Account → R2: Edit (and related) to manage buckets.
}

provider "supabase" {
  # Set SUPABASE_ACCESS_TOKEN in the environment (Dashboard → Account → Access Tokens).
}

provider "random" {}
