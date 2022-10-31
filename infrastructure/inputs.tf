variable "region" {
    type = string
}

variable "zone_name" {
    type = string
}

variable "domain" {
    type = string
}

variable "mal_client_id" {
    type = string
}

variable "mal_client_secret" {
    type = string
    sensitive = true
}