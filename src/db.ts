import { DynamoDB } from 'aws-sdk';
import { QueueStatus } from './model/QueueStatus';

const converterOptions = {
    convertEmptyValues: true,
    wrapNumbers: false,
};
const marshall = (data: Parameters<typeof DynamoDB.Converter.marshall>[0]) => DynamoDB.Converter.marshall(data, converterOptions);
const unmarshall = (data: DynamoDB.AttributeMap) => DynamoDB.Converter.unmarshall(data, converterOptions);

export class DB {
    db: DynamoDB;
    tableName: string;

    constructor() {
        this.db = new DynamoDB({region: 'us-east-1'});
        this.tableName = process.env.TABLE_NAME as string;
    }

    private pk(key: string) {
        return {
            "PK": {
                S: key,
            }
        };
    }
    
    async incrementQueueProperty(queueName: string, property: "queueLength" | "processedItems"): Promise<QueueStatus> {
        const result = await this.db.updateItem({
            TableName: this.tableName,
            Key: this.pk(`${queueName}-queue-status`),
            UpdateExpression: `ADD ${property} :q`,
            ExpressionAttributeValues: marshall({
                ':q': 1
            }),
            ReturnValues: 'ALL_NEW',
        }).promise();

        return unmarshall(result.Attributes as DynamoDB.AttributeMap) as QueueStatus;
    }

    async getQueueStatus(queueName: string): Promise<QueueStatus> {
        const result = await this.db.getItem({
            ConsistentRead: false,
            TableName: this.tableName,
            Key: this.pk(`${queueName}-queue-status`),
        }).promise();

        return unmarshall(result.Item as DynamoDB.AttributeMap) as QueueStatus;
    }
}