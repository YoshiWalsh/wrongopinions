resource "aws_s3_bucket" "data_bucket" {
    bucket_prefix = "wrongopinions-data-"
}

resource "random_id" "dynamodb_table_name" {
    keepers = {
    }

    byte_length = 8
    prefix = "wrongopinions-"
}

resource "aws_dynamodb_table" "dynamodb_table" {
    name = random_id.dynamodb_table_name.b64_url
    billing_mode = "PAY_PER_REQUEST"
    hash_key = "PK"

    attribute {
        name = "PK"
        type = "S"
    }
}