$QueueUrl = "wrongopinions-42783e11e7f25b97-failed"

$PendingAnime = (Invoke-DDBScan `
    -Region us-east-2 `
    -TableName "wrongopinions-42783e11e7f25b97" `
    -ProjectionExpression "id" `
    -FilterExpression "begins_with(PK, :prefix) and animeStatus = :status" `
    -ExpressionAttributeValue @{
        ":prefix" = [Amazon.DynamoDBv2.Model.AttributeValue]@{
            "S" = "anime-"
        };
        ":status" = [Amazon.DynamoDBv2.Model.AttributeValue]@{
            "S" = "pending"
        }
    }
)

# $PendingAnime = (Invoke-DDBScan `
#     -Region us-east-2 `
#     -TableName "wrongopinions-42783e11e7f25b97" `
#     -ProjectionExpression "id" `
#     -NoAutoIteration `
#     -FilterExpression "begins_with(PK, :prefix) and animeStatus = :status" `
#     -ExpressionAttributeValue @{
#         ":prefix" = [Amazon.DynamoDBv2.Model.AttributeValue]@{
#             "S" = "anime-"
#         };
#         ":status" = [Amazon.DynamoDBv2.Model.AttributeValue]@{
#             "S" = "pending"
#         }
#     }
# )

# $PendingAnime = (Invoke-DDBQuery `
#     -Region us-east-2 `
#     -TableName wrongopinions-42783e11e7f25b97 `
#     -KeyConditionExpression 'PK = :pk' `
#     -ExpressionAttributeValues @{
#         ':pk'= [Amazon.DynamoDBv2.Model.AttributeValue]@{
#             'S' = 'anime-975'
#         }
#     } `
#     -ProjectionExpression "id"
# )

# $PendingAnime.id | Write-Host

$jobs = $PendingAnime | Where-Object {
    $_.id.N
} | ForEach-Object {
    $id = $_.id.N
    $payload = @{
        type = "anime";
        id = $id
    } | ConvertTo-Json
    [Amazon.SQS.Model.SendMessageBatchRequestEntry]@{
        Id = "failed-script-$id"
        MessageBody = $payload
    }
}

# $jobs | Out-String | Write-Host

$counter = [pscustomobject] @{ Value = 0 }
$groupSize = 10

$batches = $jobs | Group-Object -Property { [math]::Floor($counter.Value++ / $groupSize) }

$batches | ForEach-Object {
    Write-Host "sending batch"
    Send-SQSMessageBatch -Region us-east-2 -QueueUrl $QueueUrl -Entry $_.Group
}