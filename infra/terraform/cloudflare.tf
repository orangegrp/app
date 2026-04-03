resource "cloudflare_r2_bucket" "webpc" {
  count = var.create_r2_bucket ? 1 : 0

  account_id    = var.cloudflare_account_id
  name          = var.r2_bucket_name
  location      = var.r2_location
  storage_class = "Standard"
}
