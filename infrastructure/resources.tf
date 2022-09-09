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
                    "sqs:ReceiveMessage",
                    "sqs:DeleteMessage",
                    "sqs:GetQueueAttributes",
                ],
                Effect   = "Allow",
                Resource = [
                    aws_sqs_queue.fast_queue.arn,
                    aws_sqs_queue.slow_queue.arn
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
                    aws_s3_bucket.data_bucket.arn
                ]
            },
            {
                Action = [
                    "s3:GetObject",
                    "s3:PutObject",
                ],
                Effect   = "Allow",
                Resource = [
                    join("/", [aws_s3_bucket.data_bucket.arn, "*"])
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
                    "dynamodb:Query",
                    "dynamodb:Scan",
                    "dynamodb:PutItem",
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

resource "aws_lambda_function" "function" {
    function_name = join("-", ["wrongopinions", random_id.environment_identifier.hex])
    role = aws_iam_role.function_role.arn
    handler = "bundle.handler"
    filename = "${path.module}/files/lambda.zip"

    architectures = [ "arm64" ]
    runtime = "nodejs16.x"
    memory_size = "128"
    timeout = "120"

    source_code_hash = data.archive_file.lambda_zip.output_base64sha256

    environment {
        variables = {
            TABLE_NAME = aws_dynamodb_table.dynamodb_table.id
            BUCKET_NAME = aws_s3_bucket.data_bucket.id
            SQS_QUEUE_URL = aws_sqs_queue.fast_queue.id
            MAL_CLIENT_ID = var.mal_client_id
            MAL_CLIENT_SECRET = var.mal_client_secret # I know, I know, I should use Secrets Manager.
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

resource "aws_apigatewayv2_integration" "api_integration" {
    api_id = aws_apigatewayv2_api.api.id
    integration_type = "AWS_PROXY"

    integration_method = "POST"
    integration_uri = aws_lambda_function.function.invoke_arn

    payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "api_route_GET_opinion" {
    api_id = aws_apigatewayv2_api.api.id
    route_key = "GET /opinions/{username}"

    target = join("/", ["integrations", aws_apigatewayv2_integration.api_integration.id])
}

resource "aws_apigatewayv2_route" "api_route_GET_opinion_pending" {
    api_id = aws_apigatewayv2_api.api.id
    route_key = "GET /opinions/{username}/pending"

    target = join("/", ["integrations", aws_apigatewayv2_integration.api_integration.id])
}

resource "aws_apigatewayv2_route" "api_route_POST_opinion" {
    api_id = aws_apigatewayv2_api.api.id
    route_key = "POST /opinions/{username}"

    target = join("/", ["integrations", aws_apigatewayv2_integration.api_integration.id])
}

resource "aws_apigatewayv2_deployment" "api_deployment" {
    api_id      = aws_apigatewayv2_api.api.id

    triggers = {
        redeployment = sha1(join(",", [
            jsonencode(aws_apigatewayv2_integration.api_integration),
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
}


resource "aws_lambda_permission" "lambda_apigateway_permission" {
    statement_id  = join("-", ["wrongopinions", random_id.environment_identifier.hex, "apigateway"])
    action        = "lambda:InvokeFunction"
    function_name = aws_lambda_function.function.function_name
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
    visibility_timeout_seconds = 120
    sqs_managed_sse_enabled = true
    redrive_policy = jsonencode({
        deadLetterTargetArn = aws_sqs_queue.slow_queue.arn
        maxReceiveCount = 3
    })
}

resource "aws_lambda_event_source_mapping" "fast_queue_lambda" {
    event_source_arn = aws_sqs_queue.fast_queue.arn
    function_name    = aws_lambda_function.function.arn

    batch_size = 10
    maximum_batching_window_in_seconds = 15

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
    function_name    = aws_lambda_function.function.arn

    batch_size = 10
    maximum_batching_window_in_seconds = 300

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