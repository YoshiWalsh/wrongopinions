import { DynamoDB, ConditionalCheckFailedException, AttributeValue } from '@aws-sdk/client-dynamodb';
import * as DynamoDBConverter from '@aws-sdk/util-dynamodb';
import { AnimeDetails, AnimeStatus } from './model/AnimeDetails';
import { QueueStatus } from './model/QueueStatus';

type AttributeMap = {
    [key: string]: AttributeValue,
};

const converterOptions = {
    convertEmptyValues: true,
    wrapNumbers: false,
};
const marshall = (data: Parameters<typeof DynamoDBConverter.marshall>[0]) => DynamoDBConverter.marshall(data, converterOptions) as any as Record<string, AttributeValue>;
const unmarshall = (data: AttributeMap) => DynamoDBConverter.unmarshall(data, converterOptions);

export class DB {
    db: DynamoDB;
    tableName: string;

    constructor() {
        this.db = new DynamoDB({region: 'us-east-1'});
        this.tableName = process.env.TABLE_NAME as string;
    }

    private pk(key: string): AttributeMap {
        return {
            "PK": {
                S: key,
            }
        };
    }
    
    async incrementQueueProperty(queueName: string, property: "queueLength" | "processedItems", decrement?: boolean): Promise<QueueStatus> {
        const result = await this.db.updateItem({
            TableName: this.tableName,
            Key: this.pk(`${queueName}-queue-status`),
            UpdateExpression: `ADD ${property} :q`,
            ExpressionAttributeValues: marshall({
                ':q': decrement ? -1 : 1
            }),
            ReturnValues: 'ALL_NEW',
        });

        return unmarshall(result.Attributes as AttributeMap) as QueueStatus;
    }

    async getQueueStatus(queueName: string): Promise<QueueStatus> {
        const result = await this.db.getItem({
            ConsistentRead: false,
            TableName: this.tableName,
            Key: this.pk(`${queueName}-queue-status`),
        });

        return result.Item ? unmarshall(result.Item) as QueueStatus : {
            queueName,
            processedItems: 0,
            queueLength: 0,
        };
    }

    async getAnime(id: number, stronglyConsistent: boolean): Promise<AnimeDetails | null> {
        const key = `anime-${id}`;
        const result = await this.db.getItem({
            ConsistentRead: stronglyConsistent,
            TableName: this.tableName,
            Key: this.pk(`anime-${id}`),
        });

        return result.Item ? unmarshall(result.Item) as AnimeDetails : null;
    }

    // Returns true if successful, false if unsuccessful
    async addAnime(anime: AnimeDetails): Promise<boolean> {
        try {
            await this.db.putItem({
                TableName: this.tableName,
                Item: {
                    ...this.pk(`anime-${anime.id}`),
                    ...marshall(anime),
                },
                ConditionExpression: 'attribute_not_exists(PK)',
                ReturnValues: 'ALL_OLD',
            });

            return true;
        } catch (ex) {
            if(ex instanceof ConditionalCheckFailedException) {
                return false;
            }
            throw ex;
        }
    }

    async markAnimePending(id: number, username: string, queuePosition: number) {
        try {
            await this.db.updateItem({
                TableName: this.tableName,
                Key: this.pk(`anime-${id}`),
                UpdateExpression: `SET animeStatus = :s, queuePosition = :p, dependentJobs = :j`,
                ConditionExpression: `animeStatus <> :s`,
                ExpressionAttributeValues: {
                    ':s': {
                        "S": AnimeStatus.Pending,
                    },
                    ':p': {
                        "N": queuePosition.toString(),
                    },
                    ':j': {
                        "SS": [ "", username ],
                    },
                },
            });

            return true;
        } catch (ex) {
            if(ex instanceof ConditionalCheckFailedException) {
                return false;
            }
            throw ex;
        }
    }

    async addDependentJob(id: number, username: string): Promise<number | null> {
        try {
            const result = await this.db.updateItem({
                TableName: this.tableName,
                Key: this.pk(`anime-${id}`),
                UpdateExpression: `ADD dependentJobs :j`,
                ConditionExpression: `animeStatus = :s`,
                ExpressionAttributeValues: {
                    ':s': {
                        "S": AnimeStatus.Pending,
                    },
                    ':j': {
                        "SS": [ username ],
                    },
                },
                ReturnValues: 'ALL_NEW',
            });

            const anime = unmarshall(result.Attributes as AttributeMap) as AnimeDetails;

            return anime.queuePosition as number;
        } catch (ex) {
            if(ex instanceof ConditionalCheckFailedException) {
                return null;
            }
            throw ex;
        }
    }
}