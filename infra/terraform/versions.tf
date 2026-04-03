terraform {
  required_version = ">= 1.6.0"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 2.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Use a remote backend for team workflows (Terraform Cloud, S3, GCS, etc.).
  # Example (uncomment and edit):
  #
  # backend "remote" {
  #   hostname     = "app.terraform.io"
  #   organization = "your-org"
  #   workspaces {
  #     name = "order332-app"
  #   }
  # }
}
