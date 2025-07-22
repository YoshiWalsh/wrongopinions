import { DynamoDB, ConditionalCheckFailedException, AttributeValue, ConsumedCapacity } from '@aws-sdk/client-dynamodb';
import { AdaptiveRetryStrategy } from '@aws-sdk/middleware-retry';
import * as DynamoDBConverter from '@aws-sdk/util-dynamodb';
import { AnimeData, AnimeDetails, AnimeMinimalDetails, AnimeStatus } from './model/AnimeDetails';
import { Contracts } from 'wrongopinions-common';
import { JobStatus, PendingJob } from './model/PendingJob';
import { QueueStatus } from './model/QueueStatus';
import { convert, LocalDate } from '@js-joda/core';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, NotFound, NoSuchKey, HeadObjectCommand } from '@aws-sdk/client-s3';
import { UserListAnimeEntry } from 'myanimelist-api';
import { default as getStream } from 'get-stream';
import { Readable } from 'stream';
import { initialize as initializeMetrics, Metric } from 'cloudwatch-metrics';
import goodbye from 'graceful-goodbye';

const BATCH_READ_SIZE = 100;

type AttributeMap = {
    [key: string]: AttributeValue,
};

const converterOptions = {
    convertEmptyValues: true,
    wrapNumbers: false,
};
const marshall = (data: Parameters<typeof DynamoDBConverter.marshall>[0]) => DynamoDBConverter.marshall(data, converterOptions) as any as Record<string, AttributeValue>;
const unmarshall = (data: AttributeMap) => DynamoDBConverter.unmarshall(data, converterOptions);

enum MetricUnit {
    Seconds = "Seconds",
    Microseconds = "Microseconds",
    Milliseconds = "Milliseconds",
    Bytes = "Bytes",
    Kilobytes = "Kilobytes",
    Megabytes = "Megabytes",
    Gigabytes = "Gigabytes",
    Terabytes = "Terabytes",
    Bits = "Bits",
    Kilobits = "Kilobits",
    Megabits = "Megabits",
    Gigabits = "Gigabits",
    Terabits = "Terabits",
    Percent = "Percent",
    Count = "Count",
    BytesPerSecond = "Bytes/Second",
    KilobytesPerSecond = "Kilobytes/Second",
    MegabytesPerSecond = "Megabytes/Second",
    GigabytesPerSecond = "Gigabytes/Second",
    TerabytesPerSecond = "Terabytes/Second",
    BitsPerSecond = "Bits/Second",
    KilobitsPerSecond = "Kilobits/Second",
    MegabitsPerSecond = "Megabits/Second",
    GigabitsPerSecond = "Gigabits/Second",
    TerabitsPerSecond = "Terabits/Second",
    CountPerSecond = "Count/Second",
    None = "None",
};

export class DB {
    db: DynamoDB;
    s3: S3Client;
    metric: Metric;
    tableName: string;
    dataBucketName: string;
    assetsBucketName: string;
    assetsDomain: string;

    private shutdownCallback?: () => void;

    constructor() {
        this.db = new DynamoDB({
            region: process.env.AWS_REGION as string,
            retryStrategy: new AdaptiveRetryStrategy(() => Promise.resolve(10), {

            })
        });
        this.s3 = new S3Client({
            region: process.env.AWS_REGION as string,
            retryStrategy: new AdaptiveRetryStrategy(() => Promise.resolve(10), {
                
            })
        });
        this.tableName = process.env.TABLE_NAME as string;
        this.dataBucketName = process.env.DATA_BUCKET_NAME as string;
        this.assetsBucketName = process.env.MIRROR_BUCKET_NAME as string;
        this.assetsDomain = process.env.DOMAIN as string;

        initializeMetrics({
            region: process.env.AWS_REGION as string,
        });
        this.metric = new Metric("WrongOpinions/DynamoDB", MetricUnit.Count, [{
            Name: "Environment",
            Value: process.env.ENVIRONMENT as string
        }], {
            enabled: !!process.env.ENVIRONMENT,
            storageResolution: 60,
            sendCallback: (err) => {
                if(err) {
                    console.warn("Failed to send metrics to CloudWatch", err);
                }
                this.shutdownCallback?.();
            }
        });

        goodbye(() => {
            const pending = this.metric.hasMetrics();
            const shutdownPromise = pending ? new Promise<void>(resolve => {
                this.shutdownCallback = () => {resolve()};
            }) : Promise.resolve();
            this.metric.shutdown();
            return shutdownPromise;
        });
    }

    private pk(key: string): AttributeMap {
        return {
            "PK": {
                S: key,
            }
        };
    }

    private async monitor<T extends {ConsumedCapacity?: ConsumedCapacity | Array<ConsumedCapacity>}> (operation: string, promise: Promise<T>): Promise<T> {
        const result = await promise;
        if(result.ConsumedCapacity) {
            const consumptions = Array.isArray(result.ConsumedCapacity) ? result.ConsumedCapacity : [result.ConsumedCapacity];
            for(const consumption of consumptions) {
                const RCUs = consumption.ReadCapacityUnits ?? consumption.CapacityUnits ?? 0;
                if(RCUs) {
                    this.metric.summaryPut(RCUs, "ReadCapacityUnitsConsumed", MetricUnit.Count, [
                        {
                            Name: "Operation",
                            Value: operation,
                        }
                    ]);
                }
                const WCUs = consumption.WriteCapacityUnits ?? 0;
                if(WCUs) {
                    this.metric.summaryPut(WCUs, "WriteCapacityUnitsConsumed", MetricUnit.Count, [
                        {
                            Name: "Operation",
                            Value: operation,
                        }
                    ]);
                }
            }
        }
        return result;
    }
    
    async incrementQueueProperty(queueName: string, property: "queueLength" | "processedItems", decrement?: boolean): Promise<QueueStatus> {
        const result = await this.monitor("incrementQueueProperty", this.db.updateItem({
            TableName: this.tableName,
            Key: this.pk(`queue-status-${queueName}`),
            UpdateExpression: `ADD ${property} :q`,
            ExpressionAttributeValues: marshall({
                ':q': decrement ? -1 : 1
            }),
            ReturnValues: 'ALL_NEW',
            ReturnConsumedCapacity: 'TOTAL',
        }));

        return unmarshall(result.Attributes as AttributeMap) as QueueStatus;
    }

    async getQueueStatus(queueName: string): Promise<QueueStatus> {
        const result = await this.monitor("getQueueStatus", this.db.getItem({
            ConsistentRead: false,
            TableName: this.tableName,
            Key: this.pk(`queue-status-${queueName}`),
            ReturnConsumedCapacity: 'TOTAL',
        }));

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
        const result = await this.monitor(`getAnime${stronglyConsistent ? "Consistent": ""}`, this.db.getItem({
            ConsistentRead: stronglyConsistent,
            TableName: this.tableName,
            Key: this.pk(`anime-${id}`),
            ReturnConsumedCapacity: 'TOTAL',
        }));

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

    bulkGetAnime(ids: Array<number>, stronglyConsistent?: boolean): Promise<{[id: number]: AnimeDetails | undefined}>
    bulkGetAnime(ids: Array<number>, stronglyConsistent?: boolean, minimal?: false): Promise<{[id: number]: AnimeDetails | undefined}>
    bulkGetAnime(ids: Array<number>, stronglyConsistent?: boolean, minimal?: true): Promise<{[id: number]: AnimeMinimalDetails | undefined}>
    async bulkGetAnime(ids: Array<number>, stronglyConsistent?: boolean, minimal?: boolean) {
        if(ids.length < 1) {
            return {};
        }
        const result = await this.monitor(`bulkGetAnime${ minimal ? "Minimal" : "Full" }${ stronglyConsistent ? "Consistent": "" }`, this.db.batchGetItem({
            RequestItems: {
                [this.tableName]: {
                    ConsistentRead: stronglyConsistent,
                    Keys: ids.slice(0, BATCH_READ_SIZE).map(id => this.pk(`anime-${id}`)),
                    ...(minimal ? {
                        ProjectionExpression: 'id, animeStatus, expires',
                    } : {}),
                },
            },
            ReturnConsumedCapacity: 'TOTAL',
        }));

        const retrievedAnime = result.Responses?.[this.tableName]?.map(item => this.deserialiseAnime(item)) ?? [];
        const keyed = retrievedAnime.reduce((acc, cur) => {
            if(cur) {
                return {
                    ...acc,
                    [cur.id]: cur,
                }
            }
            return acc;
        }, {});

        const unprocessedIds = result.UnprocessedKeys?.[this.tableName]?.Keys?.map(k => parseInt(k["PK"].S?.replace(/^anime-/, "") as string, 10)) ?? [];
        return {
            ...keyed,
            ...(ids.length > BATCH_READ_SIZE || unprocessedIds.length ?
                await this.bulkGetAnime(
                    [
                        ...ids.slice(BATCH_READ_SIZE),
                        ...unprocessedIds
                    ], stronglyConsistent,
                    minimal as undefined // I don't know how to make this properly statically typed
                )
            : {}),
        };
    }

    // Returns true if successful, false if unsuccessful
    async addAnime(anime: AnimeDetails): Promise<boolean> {
        try {
            await this.monitor("addAnime", this.db.putItem({
                TableName: this.tableName,
                Item: {
                    ...this.pk(`anime-${anime.id}`),
                    ...marshall(anime),
                },
                ConditionExpression: 'attribute_not_exists(PK)',
                ReturnValues: 'ALL_OLD',
                ReturnConsumedCapacity: 'TOTAL',
            }));

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
            await this.monitor("markAnimePending", this.db.updateItem({
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
                        "SS": [ "", username.toLowerCase() ],
                    },
                },
                ReturnConsumedCapacity: 'TOTAL',
            }));

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
            const result = await this.monitor("addDependentJobToAnime", this.db.updateItem({
                TableName: this.tableName,
                Key: this.pk(`anime-${id}`),
                UpdateExpression: `ADD dependentJobs :j`,
                ConditionExpression: `animeStatus = :s`,
                ExpressionAttributeValues: {
                    ':s': {
                        "S": AnimeStatus.Pending,
                    },
                    ':j': {
                        "SS": [ username.toLowerCase() ],
                    },
                },
                ReturnValues: 'ALL_NEW',
                ReturnConsumedCapacity: 'TOTAL',
            }));

            const anime = unmarshall(result.Attributes as AttributeMap) as AnimeDetails;

            return anime.queuePosition as number;
        } catch (ex) {
            if(ex instanceof ConditionalCheckFailedException) {
                return null;
            }
            throw ex;
        }
    }

    async markAnimeSuccessful(id: number, data: AnimeData, fetched: LocalDate, expires: LocalDate): Promise<AnimeDetails> {
        try {
            const results = await this.monitor("markAnimeSuccessful", this.db.updateItem({
                TableName: this.tableName,
                Key: this.pk(`anime-${id}`),
                UpdateExpression: 'SET animeStatus = :s, animeData = :d, expires = :e, lastSuccessfulFetch = :o, failedFetch = :f REMOVE dependentJobs',
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
                    ':o': {
                        'N': convert(fetched).toEpochMilli().toString(),
                    },
                    ':p': {
                        'S': AnimeStatus.Pending,
                    },
                    ':f': {
                        'NULL': true,
                    },
                },
                ConditionExpression: 'attribute_not_exists(PK) OR animeStatus = :p', // If this anime is not pending, fail the update in order to avoid double-incrementing the queue progress
                ReturnValues: 'ALL_OLD',
                ReturnConsumedCapacity: 'TOTAL',
            }));

            return this.deserialiseAnime(results.Attributes) as AnimeDetails;
        } catch (ex) {
            console.log(ex);
            throw ex;
        }
    }

    async markAnimeFailed(id: number, attempted: LocalDate, expires: LocalDate): Promise<AnimeDetails> {
        try {
            const results = await this.monitor("markAnimeFailed", this.db.updateItem({
                TableName: this.tableName,
                Key: this.pk(`anime-${id}`),
                UpdateExpression: 'SET animeStatus = :s, expires = :e, failedFetch = :f',
                ExpressionAttributeValues: {
                    ':s': {
                        'S': AnimeStatus.Failed,
                    },
                    ':e': {
                        'N': convert(expires).toEpochMilli().toString(),
                    },
                    ':f': {
                        'N': convert(attempted).toEpochMilli().toString(),
                    },
                    ':p': {
                        'S': AnimeStatus.Pending,
                    },
                },
                ConditionExpression: 'attribute_not_exists(PK) OR animeStatus = :p', // If this anime is not pending, fail the update in order to avoid double-incrementing the queue progress
                ReturnValues: 'ALL_OLD',
                ReturnConsumedCapacity: 'TOTAL',
            }));

            return this.deserialiseAnime(results.Attributes) as AnimeDetails;
        } catch (ex) {
            console.log(ex);
            throw ex;
        }
    }



    deserialiseJob(item: any): PendingJob | null {
        if(!item) {
            return null;
        }
        return unmarshall(item) as PendingJob;
    }

    async getJob(username: string, stronglyConsistent: boolean): Promise<PendingJob | null> {
        const result = await this.monitor(`getJob${ stronglyConsistent ? "Consistent" : "" }`, this.db.getItem({
            ConsistentRead: stronglyConsistent,
            TableName: this.tableName,
            Key: this.pk(`job-${username.toLowerCase()}`),
            ReturnConsumedCapacity: 'TOTAL',
        }));

        return this.deserialiseJob(result.Item);
    }

    async addJob(job: PendingJob): Promise<boolean> {
        try {
            await this.monitor("addJob", this.db.putItem({
                TableName: this.tableName,
                Item: {
                    ...this.pk(`job-${job.username.toLowerCase()}`),
                    ...marshall(job),
                },
                ReturnConsumedCapacity: 'TOTAL',
            }));
            return true;
        } catch (ex) {
            throw ex;
        };
    }

    async updateJobWaiting(username: string, animeIdsToRemove: Array<string>, lastDependencyQueuePosition: number): Promise<PendingJob> {
        const results = await this.monitor("updateJobWaiting", this.db.updateItem({
            TableName: this.tableName,
            Key: this.pk(`job-${username.toLowerCase()}`),
            UpdateExpression: `SET jobStatus = :s, initialised = :t, lastDependencyQueuePosition = :p${ animeIdsToRemove.length ? ` DELETE dependsOn :a` : '' }`,
            ExpressionAttributeValues: {
                ':s': {
                    'S': JobStatus.Waiting,
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
            ReturnConsumedCapacity: 'TOTAL',
        }));

        const job = unmarshall(results.Attributes as AttributeMap) as PendingJob;
        return job;
    }

    async updateJobQueued(username: string, queuePosition: number): Promise<PendingJob> {
        const results = await this.monitor("updateJobQueued", this.db.updateItem({
            TableName: this.tableName,
            Key: this.pk(`job-${username.toLowerCase()}`),
            UpdateExpression: `SET jobStatus = :s, queued = :t, processingQueuePosition = :p`,
            ExpressionAttributeValues: {
                ':s': {
                    'S': JobStatus.Queued,
                },
                ':t': {
                    'N': Date.now().toString(),
                },
                ':p': {
                    'N': queuePosition.toString(),
                },
            },
            ReturnValues: 'ALL_NEW',
            ReturnConsumedCapacity: 'TOTAL',
        }));

        const job = unmarshall(results.Attributes as AttributeMap) as PendingJob;
        return job;
    }

    async updateJobProcessing(username: string): Promise<PendingJob> {
        const results = await this.monitor("updateJobProcessing", this.db.updateItem({
            TableName: this.tableName,
            Key: this.pk(`job-${username.toLowerCase()}`),
            UpdateExpression: `SET jobStatus = :s, processingStarted = :t`,
            ExpressionAttributeValues: {
                ':s': {
                    'S': JobStatus.Processing,
                },
                ':t': {
                    'N': Date.now().toString(),
                },
            },
            ReturnValues: 'ALL_NEW',
            ReturnConsumedCapacity: 'TOTAL',
        }));

        return this.deserialiseJob(results.Attributes) as PendingJob;
    }

    async updateJobProcessingRetry(username: string): Promise<PendingJob> {
        const results = await this.monitor("updateJobProcessingRetry", this.db.updateItem({
            TableName: this.tableName,
            Key: this.pk(`job-${username.toLowerCase()}`),
            UpdateExpression: `SET jobStatus = :s REMOVE processingStarted`,
            ExpressionAttributeValues: {
                ':s': {
                    'S': JobStatus.Queued,
                },
            },
            ReturnValues: 'ALL_NEW',
            ReturnConsumedCapacity: 'TOTAL',
        }));

        return this.deserialiseJob(results.Attributes) as PendingJob;
    }

    async updateJobProcessingFailed(username: string): Promise<PendingJob> {
        const results = await this.monitor("updateJobProcessingFailed", this.db.updateItem({
            TableName: this.tableName,
            Key: this.pk(`job-${username.toLowerCase()}`),
            UpdateExpression: `SET jobStatus = :s, failed = :t`,
            ExpressionAttributeValues: {
                ':s': {
                    'S': JobStatus.Queued,
                },
                ':t': {
                    'N': Date.now().toString(),
                },
            },
            ReturnValues: 'ALL_NEW',
            ReturnConsumedCapacity: 'TOTAL',
        }));

        return this.deserialiseJob(results.Attributes) as PendingJob;
    }

    async removeAnimeFromJob(username: string, animeId: number): Promise<PendingJob> {
        const results = await this.monitor("removeAnimeFromJob", this.db.updateItem({
            TableName: this.tableName,
            Key: this.pk(`job-${username.toLowerCase()}`),
            UpdateExpression: `DELETE dependsOn :a`,
            ExpressionAttributeValues: {
                ':a': {
                    'SS': [ `anime-${animeId}` ],
                }
            },
            ReturnValues: 'ALL_NEW',
            ReturnConsumedCapacity: 'TOTAL',
        }));

        const job = unmarshall(results.Attributes as AttributeMap) as PendingJob;
        return job;
    }

    async removeJob(username: string): Promise<void> {
        await this.monitor("removeJob", this.db.deleteItem({
            TableName: this.tableName,
            Key: this.pk(`job-${username.toLowerCase()}`),
            ReturnConsumedCapacity: 'TOTAL',
        }));
    }


    

    async getCompletedUrl(username: string): Promise<string | null> {
        const key = `completed/${username.toLowerCase()}.json`;
        try {
            const params = {
                Bucket: this.assetsBucketName,
                Key: key,
            };
            await this.s3.send(new HeadObjectCommand(params)); // We don't care about the result, only that it doesn't throw
            return `https://${this.assetsDomain}/${key}`;
        } catch (ex) {
            // GetObject returns NoSuchKey and HeadObject returns NotFound
            // AWS value backwards compat so I'm sure they wouldn't change
            // this, but the distinction is weird enough that I feel safer
            // checking for both.
            if(ex instanceof NoSuchKey || ex instanceof NotFound) {
                return null;
            }
            throw ex;
        }
    }

    async addCompleted(results: Contracts.Results): Promise<void> {
        const key = `completed/${results.username.toLowerCase()}.json`;
        await this.s3.send(new PutObjectCommand({
            Bucket: this.assetsBucketName,
            Key: key,
            Body: JSON.stringify(results),
        }));
    }


    async saveAnimeList(username: string, animeList: Array<UserListAnimeEntry>): Promise<void> {
        await this.s3.send(new PutObjectCommand({
            Bucket: this.dataBucketName,
            Key: `animeList-${username.toLowerCase()}.json`,
            Body: JSON.stringify(animeList),
        }));
    }

    async loadAnimeList(username: string): Promise<Array<UserListAnimeEntry>> {
        const object = await this.s3.send(new GetObjectCommand({
            Bucket: this.dataBucketName,
            Key: `animeList-${username.toLowerCase()}.json`,
        }));
        return JSON.parse(await getStream(object.Body as Readable)) as Array<UserListAnimeEntry>;
    }

    async deleteAnimeList(username: string): Promise<void> {
        await this.s3.send(new DeleteObjectCommand({
            Bucket: this.dataBucketName,
            Key: `animeList-${username.toLowerCase()}.json`,
        }));
    }
}