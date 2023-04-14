resource "random_id" "environment_identifier" {
    keepers = {
    }

    byte_length = 8
}

data "archive_file" "lambda_zip" {
    type             = "zip"
    source_file      = "${path.module}/../server/dist/bundle.js"
    output_file_mode = "0666"
    output_path      = "${path.module}/files/lambda.zip"
}

resource "aws_s3_bucket" "data_bucket" {
    bucket = join("-", ["wrongopinions", random_id.environment_identifier.hex, "data"])
}

resource "aws_s3_bucket" "mirror_bucket" {
    bucket = join("-", ["wrongopinions", random_id.environment_identifier.hex, "mirror"])
}

resource "aws_s3_bucket_policy" "mirror_policy_attachment" {
    bucket = aws_s3_bucket.mirror_bucket.id
    policy = data.aws_iam_policy_document.mirror_policy.json
}

data "aws_iam_policy_document" "mirror_policy" {
    statement {
        principals {
            type = "Service"
            identifiers = ["cloudfront.amazonaws.com"]
        }

        actions = [
            "s3:GetObject",
            # Lack of ListBucket permission means missing objects will return 403 instead of 404
        ]

        resources = [
            aws_s3_bucket.mirror_bucket.arn,
            "${aws_s3_bucket.mirror_bucket.arn}/*",
        ]

        condition {
            test = "StringEquals"
            variable = "AWS:SourceArn"
            values = [ aws_cloudfront_distribution.cf_distribution.arn ]
        }
    }
}

resource "aws_s3_bucket_cors_configuration" "mirror_bucket_cors" {
    bucket = aws_s3_bucket.mirror_bucket.id

    cors_rule {
        allowed_methods = ["GET"]
        allowed_origins = ["*"]
    }
}

resource "aws_s3_bucket" "app_bucket" {
    bucket = join("-", ["wrongopinions", random_id.environment_identifier.hex, "app"])
}

resource "aws_s3_bucket_policy" "website_policy_attachment" {
    bucket = aws_s3_bucket.app_bucket.id
    policy = data.aws_iam_policy_document.website_policy.json
}

data "aws_iam_policy_document" "website_policy" {
    statement {
        principals {
            type = "AWS"
            identifiers = ["*"]
        }

        actions = [
            "s3:GetObject",
            "s3:ListBucket",
        ]

        resources = [
            aws_s3_bucket.app_bucket.arn,
            "${aws_s3_bucket.app_bucket.arn}/*",
        ]
    }
}

resource "aws_s3_bucket_website_configuration" "app_bucket_website" {
    bucket = aws_s3_bucket.app_bucket.id

    index_document {
        suffix = "index.html"
    }

    error_document {
        key = "404.html"
    }
}

resource "aws_dynamodb_table" "dynamodb_table" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex])
    billing_mode = "PAY_PER_REQUEST"
    hash_key = "PK"

    attribute {
        name = "PK"
        type = "S"
    }
}

resource "aws_iam_role" "function_role" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex])

    assume_role_policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
    {
        "Action": "sts:AssumeRole",
        "Principal": {
        "Service": "lambda.amazonaws.com"
        },
        "Effect": "Allow",
        "Sid": ""
    }
    ]
}
EOF
}

resource "aws_iam_role_policy" "function_role_basicexecution" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex, "basicexecution"])
    role = aws_iam_role.function_role.name

    policy = jsonencode({
        Version = "2012-10-17"
        Statement = [
            {
                Action = [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                ],
                Effect   = "Allow",
                Resource = [
                    "*"
                ]
            }
        ]
    })
}

resource "aws_iam_role_policy" "function_role_sqs" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex, "sqs"])
    role = aws_iam_role.function_role.id

    policy = jsonencode({
        Version = "2012-10-17"
        Statement = [
            {
                Action = [
                    "sqs:SendMessage",
                    "sqs:ReceiveMessage",
                    "sqs:DeleteMessage",
                    "sqs:GetQueueAttributes",
                ],
                Effect   = "Allow",
                Resource = [
                    aws_sqs_queue.fast_queue.arn,
                    aws_sqs_queue.slow_queue.arn,
                    aws_sqs_queue.processing_queue.arn,
                    aws_sqs_queue.failed_queue.arn
                ]
            }
        ]
    })
}

resource "aws_iam_role_policy" "function_role_s3" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex, "s3"])
    role = aws_iam_role.function_role.id

    policy = jsonencode({
        Version = "2012-10-17"
        Statement = [
            {
                Action = [
                    "s3:ListBucket",
                ],
                Effect   = "Allow",
                Resource = [
                    aws_s3_bucket.data_bucket.arn,
                    aws_s3_bucket.mirror_bucket.arn,
                ]
            },
            {
                Action = [
                    "s3:GetObject",
                    "s3:PutObject",
                ],
                Effect   = "Allow",
                Resource = [
                    join("/", [aws_s3_bucket.data_bucket.arn, "*"]),
                    join("/", [aws_s3_bucket.mirror_bucket.arn, "*"]),
                ]
            }
        ]
    })
}

resource "aws_iam_role_policy" "function_role_dynamodb" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex, "dynamodb"])
    role = aws_iam_role.function_role.id

    policy = jsonencode({
        Version = "2012-10-17"
        Statement = [
            {
                Action = [
                    "dynamodb:GetItem",
                    "dynamodb:BatchGetItem",
                    "dynamodb:Query",
                    "dynamodb:Scan",
                    "dynamodb:PutItem",
                    "dynamodb:BatchWriteItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:DeleteItem",
                ],
                Effect   = "Allow",
                Resource = [
                    aws_dynamodb_table.dynamodb_table.arn
                ]
            },
        ]
    })
}

resource "aws_lambda_function" "function_limited" {
    function_name = join("-", ["wrongopinions", random_id.environment_identifier.hex, "limited"])
    role = aws_iam_role.function_role.arn
    handler = "bundle.handler"
    filename = "${path.module}/files/lambda.zip"

    architectures = [ "arm64" ]
    runtime = "nodejs16.x"
    memory_size = "256"
    timeout = "30" # Usually this function will complete in ~10 seconds, but if it times out it breaks our queue length logic and we really want to avoid that.

    reserved_concurrent_executions = var.limited_function_concurrency

    source_code_hash = data.archive_file.lambda_zip.output_base64sha256

    environment {
        variables = {
            TABLE_NAME = aws_dynamodb_table.dynamodb_table.id
            DATA_BUCKET_NAME = aws_s3_bucket.data_bucket.id
            MIRROR_BUCKET_NAME = aws_s3_bucket.mirror_bucket.id
            DOMAIN = var.domain
            SQS_ANIME_QUEUE_URL = aws_sqs_queue.fast_queue.id
            SQS_JOB_QUEUE_URL = aws_sqs_queue.processing_queue.id
            SQS_FAILED_QUEUE_ARN = aws_sqs_queue.failed_queue.arn
            MAL_CLIENT_ID = var.mal_client_id
            MAL_CLIENT_SECRET = var.mal_client_secret # I know, I know, I should use Secrets Manager.
            NODE_OPTIONS = "--enable-source-maps"
        }
    }
}
resource "aws_lambda_function" "function_heavyweight" {
    function_name = join("-", ["wrongopinions", random_id.environment_identifier.hex, "heavy"])
    role = aws_iam_role.function_role.arn
    handler = "bundle.handler"
    filename = "${path.module}/files/lambda.zip"

    architectures = [ "arm64" ]
    runtime = "nodejs16.x"
    memory_size = "768"
    timeout = "120"

    source_code_hash = data.archive_file.lambda_zip.output_base64sha256

    environment {
        variables = {
            TABLE_NAME = aws_dynamodb_table.dynamodb_table.id
            DATA_BUCKET_NAME = aws_s3_bucket.data_bucket.id
            MIRROR_BUCKET_NAME = aws_s3_bucket.mirror_bucket.id
            DOMAIN = var.domain
            SQS_ANIME_QUEUE_URL = aws_sqs_queue.fast_queue.id
            SQS_JOB_QUEUE_URL = aws_sqs_queue.processing_queue.id
            SQS_FAILED_QUEUE_ARN = aws_sqs_queue.failed_queue.arn
            MAL_CLIENT_ID = var.mal_client_id
            MAL_CLIENT_SECRET = var.mal_client_secret # I know, I know, I should use Secrets Manager.
            NODE_OPTIONS = "--enable-source-maps"
        }
    }
}
resource "aws_lambda_function" "function_lightweight" {
    function_name = join("-", ["wrongopinions", random_id.environment_identifier.hex, "light"])
    role = aws_iam_role.function_role.arn
    handler = "bundle.handler"
    filename = "${path.module}/files/lambda.zip"

    architectures = [ "arm64" ]
    runtime = "nodejs16.x"
    memory_size = "256"
    timeout = "30"

    source_code_hash = data.archive_file.lambda_zip.output_base64sha256

    environment {
        variables = {
            TABLE_NAME = aws_dynamodb_table.dynamodb_table.id
            DATA_BUCKET_NAME = aws_s3_bucket.data_bucket.id
            MIRROR_BUCKET_NAME = aws_s3_bucket.mirror_bucket.id
            DOMAIN = var.domain
            SQS_ANIME_QUEUE_URL = aws_sqs_queue.fast_queue.id
            SQS_JOB_QUEUE_URL = aws_sqs_queue.processing_queue.id
            SQS_FAILED_QUEUE_ARN = aws_sqs_queue.failed_queue.arn
            MAL_CLIENT_ID = var.mal_client_id
            MAL_CLIENT_SECRET = var.mal_client_secret # I know, I know, I should use Secrets Manager.
            NODE_OPTIONS = "--enable-source-maps"
        }
    }
}

resource "aws_apigatewayv2_api" "api" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex])
    protocol_type = "HTTP"

    cors_configuration {
        allow_origins = [ "*" ]
        allow_methods = [ "GET", "POST" ]
    }
}

resource "aws_apigatewayv2_integration" "api_integration_heavy" {
    api_id = aws_apigatewayv2_api.api.id
    integration_type = "AWS_PROXY"

    integration_method = "POST"
    integration_uri = aws_lambda_function.function_heavyweight.invoke_arn

    payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "api_integration_light" {
    api_id = aws_apigatewayv2_api.api.id
    integration_type = "AWS_PROXY"

    integration_method = "POST"
    integration_uri = aws_lambda_function.function_lightweight.invoke_arn

    payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "api_route_GET_opinion" {
    api_id = aws_apigatewayv2_api.api.id
    route_key = "GET /opinions/{username}"

    target = join("/", ["integrations", aws_apigatewayv2_integration.api_integration_light.id])
}

resource "aws_apigatewayv2_route" "api_route_GET_opinion_pending" {
    api_id = aws_apigatewayv2_api.api.id
    route_key = "GET /opinions/{username}/pending"

    target = join("/", ["integrations", aws_apigatewayv2_integration.api_integration_light.id])
}

resource "aws_apigatewayv2_route" "api_route_POST_opinion" {
    api_id = aws_apigatewayv2_api.api.id
    route_key = "POST /opinions/{username}"

    target = join("/", ["integrations", aws_apigatewayv2_integration.api_integration_heavy.id])
}

resource "aws_apigatewayv2_deployment" "api_deployment" {
    api_id      = aws_apigatewayv2_api.api.id

    triggers = {
        redeployment = sha1(join(",", [
            jsonencode(aws_apigatewayv2_integration.api_integration_heavy),
            jsonencode(aws_apigatewayv2_integration.api_integration_light),
            jsonencode(aws_apigatewayv2_route.api_route_GET_opinion),
            jsonencode(aws_apigatewayv2_route.api_route_GET_opinion_pending),
            jsonencode(aws_apigatewayv2_route.api_route_POST_opinion),
        ]))
    }

    lifecycle {
        create_before_destroy = true
    }
}

resource "aws_apigatewayv2_stage" "api_stage" {
    api_id = aws_apigatewayv2_api.api.id
    name   = "PROD"

    auto_deploy = false

    deployment_id = aws_apigatewayv2_deployment.api_deployment.id

    depends_on = [ aws_apigatewayv2_deployment.api_deployment ]
}


resource "aws_lambda_permission" "lambda_apigateway_permission_light" {
    statement_id  = join("-", ["wrongopinions", random_id.environment_identifier.hex, "apigateway"])
    action        = "lambda:InvokeFunction"
    function_name = aws_lambda_function.function_lightweight.function_name
    principal     = "apigateway.amazonaws.com"

    # The /*/*/* part allows invocation from any stage, method and resource path
    # within API Gateway REST API.
    source_arn = "${aws_apigatewayv2_api.api.execution_arn}/*/*/*"
}

resource "aws_lambda_permission" "lambda_apigateway_permission_heavy" {
    statement_id  = join("-", ["wrongopinions", random_id.environment_identifier.hex, "apigateway"])
    action        = "lambda:InvokeFunction"
    function_name = aws_lambda_function.function_heavyweight.function_name
    principal     = "apigateway.amazonaws.com"

    # The /*/*/* part allows invocation from any stage, method and resource path
    # within API Gateway REST API.
    source_arn = "${aws_apigatewayv2_api.api.execution_arn}/*/*/*"
}


# In order to compensate for transient issues AND extended MAL outages, we set up a tiered queue system.
# Initially, the job is visible with no delay. After that, the job will be retried 2 more times, each time 2 minutes apart.
resource "aws_sqs_queue" "fast_queue" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex, "fast"])
    delay_seconds = 0
    visibility_timeout_seconds = 35 # Slightly longer than the lambda timeout
    sqs_managed_sse_enabled = true
    redrive_policy = jsonencode({
        deadLetterTargetArn = aws_sqs_queue.slow_queue.arn
        maxReceiveCount = 3
    })
}

resource "aws_lambda_event_source_mapping" "fast_queue_lambda" {
    event_source_arn = aws_sqs_queue.fast_queue.arn
    function_name    = aws_lambda_function.function_limited.arn

    batch_size = 1
    maximum_batching_window_in_seconds = 15
    function_response_types = ["ReportBatchItemFailures"]

    depends_on = [
        aws_iam_role_policy.function_role_sqs
    ]
}

# After that, we wait 15 minutes until the next try. Then we try again every hour, 7 more times.
resource "aws_sqs_queue" "slow_queue" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex, "slow"])
    delay_seconds = 900
    visibility_timeout_seconds = 3600
    sqs_managed_sse_enabled = true
    redrive_policy = jsonencode({
        deadLetterTargetArn = aws_sqs_queue.dead_queue.arn
        maxReceiveCount = 8
    })
}

resource "aws_lambda_event_source_mapping" "slow_queue_lambda" {
    event_source_arn = aws_sqs_queue.slow_queue.arn
    function_name    = aws_lambda_function.function_limited.arn

    batch_size = 1
    maximum_batching_window_in_seconds = 15
    function_response_types = ["ReportBatchItemFailures"]

    depends_on = [
        aws_iam_role_policy.function_role_sqs
    ]
}

# Finally, we move the job into the DLQ for manual inspection / redriving
resource "aws_sqs_queue" "dead_queue" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex, "dead"])
    delay_seconds = 0
    visibility_timeout_seconds = 0
    message_retention_seconds = 1209600
    sqs_managed_sse_enabled = true
}

resource "aws_sqs_queue" "processing_queue" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex, "processing"])
    delay_seconds = 0
    visibility_timeout_seconds = 130
    sqs_managed_sse_enabled = true
    redrive_policy = jsonencode({
        deadLetterTargetArn = aws_sqs_queue.failed_queue.arn
        maxReceiveCount = 2
    })
}

resource "aws_lambda_event_source_mapping" "processing_queue_lambda" {
    event_source_arn = aws_sqs_queue.processing_queue.arn
    function_name    = aws_lambda_function.function_heavyweight.arn

    batch_size = 1
    maximum_batching_window_in_seconds = 15
    function_response_types = ["ReportBatchItemFailures"]

    depends_on = [
        aws_iam_role_policy.function_role_sqs
    ]
}

resource "aws_sqs_queue" "failed_queue" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex, "failed"])
    delay_seconds = 0
    visibility_timeout_seconds = 120
    message_retention_seconds = 1209600
    sqs_managed_sse_enabled = true
}

resource "aws_lambda_event_source_mapping" "failed_queue_lambda" {
    event_source_arn = aws_sqs_queue.failed_queue.arn
    function_name    = aws_lambda_function.function_lightweight.arn

    batch_size = 1
    maximum_batching_window_in_seconds = 15
    function_response_types = ["ReportBatchItemFailures"]

    depends_on = [
        aws_iam_role_policy.function_role_sqs
    ]
}

resource "aws_acm_certificate" "cf_cert" {
    provider = aws.global

    domain_name = var.domain
    validation_method = "DNS"
}

data "aws_route53_zone" "zone" {
    name = var.zone_name
    private_zone = false
}

resource "aws_route53_record" "cf_cert_validation_dns" {
    for_each = {
        for dvo in aws_acm_certificate.cf_cert.domain_validation_options : dvo.domain_name => {
            name = dvo.resource_record_name
            record = dvo.resource_record_value
            type = dvo.resource_record_type
        }
    }

    allow_overwrite = true
    name = each.value.name
    records = [each.value.record]
    ttl = 60
    type = each.value.type
    zone_id = data.aws_route53_zone.zone.zone_id
}

resource "aws_route53_record" "cf_dns" {
    for_each = toset(["A", "AAAA"])

    zone_id = data.aws_route53_zone.zone.zone_id

    allow_overwrite = true
    name = "${var.domain}"
    type = each.key

    alias {
        name = "${aws_cloudfront_distribution.cf_distribution.domain_name}"
        zone_id = "${aws_cloudfront_distribution.cf_distribution.hosted_zone_id}"
        evaluate_target_health = false
    }
}

resource "aws_acm_certificate_validation" "cf_cert_validation" {
    provider = aws.global

    certificate_arn = aws_acm_certificate.cf_cert.arn
    validation_record_fqdns = [for record in aws_route53_record.cf_cert_validation_dns : record.fqdn]
}

resource "aws_cloudfront_origin_access_control" "cf_oac" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex])
    description = "OAC"
    origin_access_control_origin_type = "s3"
    signing_behavior = "always"
    signing_protocol = "sigv4"
}

resource "aws_cloudfront_response_headers_policy" "response_headers" {
    name = join("-", ["wrongopinions", random_id.environment_identifier.hex])

    cors_config {
        access_control_allow_origins {
            items = ["http://localhost:4200"]
        }

        access_control_allow_methods {
            items = ["OPTIONS", "HEAD", "GET"]
        }

        access_control_allow_headers {
            items = ["*"]
        }

        access_control_expose_headers {
            items = ["*"]
        }

        access_control_allow_credentials = false
        
        origin_override = true
    }
}

resource "aws_cloudfront_distribution" "cf_distribution" {
    origin {
        origin_id = "mirror"
        domain_name = aws_s3_bucket.mirror_bucket.bucket_regional_domain_name
        origin_access_control_id = aws_cloudfront_origin_access_control.cf_oac.id
    }

    origin {
        origin_id = "app"
        domain_name = aws_s3_bucket_website_configuration.app_bucket_website.website_endpoint

        custom_origin_config {
            http_port = 80
            https_port = 443
            origin_protocol_policy = "http-only"
            origin_ssl_protocols = [ "TLSv1.2" ]
        }
    }

    enabled = true
    is_ipv6_enabled = true
    comment = "Wrong Opinions ${random_id.environment_identifier.hex}"
    default_root_object = "index.html"

    aliases = [var.domain]

    default_cache_behavior {
        allowed_methods = ["GET", "HEAD", "OPTIONS"]
        cached_methods = ["GET", "HEAD"]
        target_origin_id = "app"

        forwarded_values {
            query_string = false

            cookies {
                forward = "none"
            }
        }

        viewer_protocol_policy = "redirect-to-https"
        min_ttl = 3600
        default_ttl = 3600
        max_ttl = 86400
    }

    ordered_cache_behavior {
        path_pattern = "/mirrored/*"

        allowed_methods = ["GET", "HEAD", "OPTIONS"]
        cached_methods = ["GET", "HEAD"]

        target_origin_id = "mirror"

        forwarded_values {
            query_string = false

            cookies {
                forward = "none"
            }

            headers = [ "Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers" ]
        }

        viewer_protocol_policy = "redirect-to-https"
        min_ttl = 3600
        default_ttl = 3600
        max_ttl = 86400

        response_headers_policy_id = aws_cloudfront_response_headers_policy.response_headers.id
    }

    ordered_cache_behavior {
        path_pattern = "/completed/*"

        allowed_methods = ["GET", "HEAD", "OPTIONS"]
        cached_methods = ["GET", "HEAD"]

        target_origin_id = "mirror"

        forwarded_values {
            query_string = false

            cookies {
                forward = "none"
            }

            headers = [ "Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers" ]
        }

        viewer_protocol_policy = "redirect-to-https"
        min_ttl = 3600
        default_ttl = 3600
        max_ttl = 86400

        response_headers_policy_id = aws_cloudfront_response_headers_policy.response_headers.id
    }

    restrictions {
        geo_restriction {
            restriction_type = "none"
        }
    }

    custom_error_response {
        # 404 means the object was not found in the app bucket, we should return 200 in order to make clientside routing work
        error_code = 404
        error_caching_min_ttl = 3600
        response_code = 200
        response_page_path = "/index.html"
    }

    custom_error_response {
        # 403 means the object was not found in the mirror bucket, we should return 404 as the asset doesn't exist
        error_code = 403
        error_caching_min_ttl = 3600
        response_code = 404
        response_page_path = "/404.html"
    }

    price_class = "PriceClass_100"

    viewer_certificate {
        acm_certificate_arn = aws_acm_certificate_validation.cf_cert_validation.certificate_arn
        ssl_support_method = "sni-only"
        minimum_protocol_version = "TLSv1.2_2021"
    }
}

