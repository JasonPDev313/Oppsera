variable "project" {
  type    = string
  default = "oppsera"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

# ── Web ──
variable "web_cpu" {
  type    = number
  default = 1024   # 1 vCPU
}

variable "web_memory" {
  type    = number
  default = 2048   # 2 GB
}

variable "web_desired_count" {
  type    = number
  default = 2
}

variable "web_max_count" {
  type    = number
  default = 6
}

# ── Worker ──
variable "worker_cpu" {
  type    = number
  default = 512   # 0.5 vCPU
}

variable "worker_memory" {
  type    = number
  default = 1024  # 1 GB
}

variable "worker_desired_count" {
  type    = number
  default = 1
}

# ── Database ──
variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "db_allocated_storage" {
  type    = number
  default = 20   # GB
}

variable "db_max_storage" {
  type    = number
  default = 100  # GB (auto-scaling)
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "enable_read_replica" {
  type    = bool
  default = false
}

# ── Redis ──
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}

# ── External Services ──
variable "acm_certificate_arn" {
  type = string
}

variable "sentry_dsn" {
  type    = string
  default = ""
}

variable "supabase_url" {
  type = string
}

variable "supabase_anon_key" {
  type      = string
  sensitive = true
}
