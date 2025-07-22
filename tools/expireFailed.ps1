$timestamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds() 

$FailedAnime = (Invoke-DDBScan `
    -Region us-east-2 `
    -TableName "wrongopinions-42783e11e7f25b97" `
    -ProjectionExpression "id" `
    -FilterExpression "begins_with(PK, :prefix) and animeStatus = :status AND expires > :now" `
    -ExpressionAttributeValue @{
        ":prefix" = [Amazon.DynamoDBv2.Model.AttributeValue]@{
            "S" = "anime-"
        };
        ":status" = [Amazon.DynamoDBv2.Model.AttributeValue]@{
            "S" = "failed"
        };
        ":now" = [Amazon.DynamoDBv2.Model.AttributeValue]@{
            "N" = $timestamp
        }
    }
)

$FailedAnime | ForEach-Object {
    $id = $_.id.N
    Update-DDBItem `
        -Region us-east-2 `
        -TableName "wrongopinions-42783e11e7f25b97" `
        -Key @{
            "PK" = [Amazon.DynamoDBv2.Model.AttributeValue]@{
                "S" = "anime-$id"
            }
        } `
        -UpdateExpression "SET expires = :now" `
        -ExpressionAttributeValue @{
            ":now" = [Amazon.DynamoDBv2.Model.AttributeValue]@{
                "N" = $timestamp
            }
        }
}