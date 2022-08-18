import { DynamoDB, ConditionalCheckFailedException, AttributeValue } from '@aws-sdk/client-dynamodb';
import * as DynamoDBConverter from '@aws-sdk/util-dynamodb';
import { AnimeData, AnimeDetails, AnimeStatus } from './model/AnimeDetails';
import { CompletedJob } from './model/CompletedJob';
import { JobStatus, PendingJob } from './model/PendingJob';
import { QueueStatus } from './model/QueueStatus';
import { convert, LocalDate } from '@js-joda/core';

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

    deserialiseAnime(item: any): AnimeDetails | null {
        if(!item) {
            return null;
        }
        const unpacked = unmarshall(item);
        return {
            ...unpacked,
            animeData: unpacked.animeData ? JSON.parse(unpacked.animeData) : undefined,
        } as AnimeDetails;
    }

    async getAnime(id: number, stronglyConsistent: boolean): Promise<AnimeDetails | null> {
        const result = await this.db.getItem({
            ConsistentRead: stronglyConsistent,
            TableName: this.tableName,
            Key: this.pk(`anime-${id}`),
        });

        return this.deserialiseAnime(result.Item);
    }

    async getMultipleAnime(ids: Array<number>, stronglyConsistent: boolean): Promise<{[id: number]: AnimeDetails | undefined}> {
        const retrievedAnime = await Promise.all(ids.map(id => this.getAnime(id, stronglyConsistent).catch(ex => undefined)));
        return retrievedAnime.reduce((acc, cur) => {
            if(cur) {
                return {
                    ...acc,
                    [cur.id]: cur,
                }
            }
            return acc;
        }, {});
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

    async addDependentJobToAnime(id: number, username: string): Promise<number | null> {
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

    async markAnimeSuccessful(id: number, data: AnimeData, expires: LocalDate): Promise<AnimeDetails> {
        try {
            const results = await this.db.updateItem({
                TableName: this.tableName,
                Key: this.pk(`anime-${id}`),
                UpdateExpression: 'SET animeStatus = :s, animeData = :d, expires = :e REMOVE dependentJobs',
                ExpressionAttributeValues: {
                    ':s': {
                        'S': AnimeStatus.Cached,
                    },
                    ':d': {
                        'S': JSON.stringify(data),
                    },
                    ':e': {
                        'N': convert(expires).toEpochMilli().toString(),
                    },
                },
                ReturnValues: 'ALL_OLD',
            });

            return this.deserialiseAnime(results.Attributes) as AnimeDetails;
        } catch (ex) {
            console.log(ex);
            throw ex;
        }
    }

    async markAnimeFailed(id: number): Promise<AnimeDetails> {
        const results = await this.db.updateItem({
            TableName: this.tableName,
            Key: this.pk(`anime-${id}`),
            UpdateExpression: 'SET animeStatus = :s',
            ExpressionAttributeValues: {
                ':s': {
                    'S': AnimeStatus.Failed,
                },
            },
            ReturnValues: 'ALL_OLD',
        });

        return this.deserialiseAnime(results.Attributes) as AnimeDetails;
    }



    deserialiseJob(item: any): PendingJob | null {
        if(!item) {
            return null;
        }
        const unpacked = unmarshall(item);
        return {
            ...unpacked,
            animeList: unpacked.animeList ? JSON.parse(unpacked.animeList) : undefined,
        } as PendingJob;
    }

    async getJob(username: string, stronglyConsistent: boolean): Promise<PendingJob | null> {
        const result = await this.db.getItem({
            ConsistentRead: stronglyConsistent,
            TableName: this.tableName,
            Key: this.pk(`job-${username}`),
        });

        return this.deserialiseJob(result.Item);
    }

    async addJob(job: PendingJob): Promise<boolean> {
        try {
            await this.db.putItem({
                TableName: this.tableName,
                Item: {
                    ...this.pk(`job-${job.username}`),
                    ...marshall({
                        ...job,
                        animeList: JSON.stringify(job.animeList),
                    }),
                },
                ConditionExpression: 'attribute_not_exists(PK) OR jobStatus = :s',
                ExpressionAttributeValues: {
                    ':s': {
                        'S': JobStatus.Processing,
                    },
                },
            })
            return true;
        } catch (ex) {
            if(ex instanceof ConditionalCheckFailedException) {
                return false;
            }
            throw ex;
        };
    }

    async updateJobStatusAndRemoveDependencies(username: string, status: JobStatus, animeIdsToRemove: Array<string>, lastDependencyQueuePosition: number): Promise<number> {
        const results = await this.db.updateItem({
            TableName: this.tableName,
            Key: this.pk(`job-${username}`),
            UpdateExpression: `SET jobStatus = :s, lastStateChange = :t, lastDependencyQueuePosition = :p${ animeIdsToRemove.length ? ` DELETE dependsOn :a` : '' }`,
            ExpressionAttributeValues: {
                ':s': {
                    'S': status,
                },
                ':t': {
                    'N': Date.now().toString(),
                },
                ':p': {
                    'N': lastDependencyQueuePosition.toString(),
                },
                ...(
                    animeIdsToRemove.length ? {
                        ':a': {
                            'SS': animeIdsToRemove,
                        },
                    } : {}
                ),
            },
            ReturnValues: 'ALL_NEW',
        });

        const job = unmarshall(results.Attributes as AttributeMap) as PendingJob;
        return job.dependsOn.size - 1;
    }

    async updateJobStatus(username: string, status: JobStatus): Promise<number> {
        const results = await this.db.updateItem({
            TableName: this.tableName,
            Key: this.pk(`job-${username}`),
            UpdateExpression: `SET jobStatus = :s, lastStateChange = :t`,
            ExpressionAttributeValues: {
                ':s': {
                    'S': status,
                },
                ':t': {
                    'N': Date.now().toString(),
                },
            },
            ReturnValues: 'ALL_NEW',
        });

        const job = unmarshall(results.Attributes as AttributeMap) as PendingJob;
        return job.dependsOn.size - 1;
    }

    async removeAnimeFromJob(username: string, animeId: number): Promise<number> {
        const results = await this.db.updateItem({
            TableName: this.tableName,
            Key: this.pk(`job-${username}`),
            UpdateExpression: `DELETE dependsOn :a`,
            ExpressionAttributeValues: {
                ':a': {
                    'SS': [ `anime-${animeId}` ],
                }
            },
            ReturnValues: 'ALL_NEW',
        });

        const job = unmarshall(results.Attributes as AttributeMap) as PendingJob;
        return job.dependsOn.size - 1;
    }

    async removeJob(username: string): Promise<void> {
        await this.db.deleteItem({
            TableName: this.tableName,
            Key: this.pk(`job-${username}`),
        });
    }


    

    async getCompleted(username: string): Promise<CompletedJob | null> {
        const result = await this.db.getItem({
            ConsistentRead: true,
            TableName: this.tableName,
            Key: this.pk(`completed-${username}`),
        });

        return result.Item ? unmarshall(result.Item) as CompletedJob : null;
    }

    async addCompleted(job: CompletedJob): Promise<void> {
        await this.db.putItem({
            TableName: this.tableName,
            Item: {
                ...this.pk(`completed-${job.username}`),
                ...marshall(job),
            },
        });
    }





}