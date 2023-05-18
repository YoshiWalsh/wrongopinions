declare module 'cloudwatch-metrics' {
    import { CloudWatchClientConfig } from '@aws-sdk/client-cloudwatch';

    export function initialize(options?: CloudWatchClientConfig): void;

    export interface IDimension {
        Name: string;
        Value: unknown;
    }

    export type MetricUnit = "Seconds" | "Microseconds" | "Milliseconds" | "Bytes" | "Kilobytes" | "Megabytes" | "Gigabytes" | "Terabytes" | "Bits" | "Kilobits" | "Megabits" | "Gigabits" | "Terabits" | "Percent" | "Count" | "Bytes/Second" | "Kilobytes/Second" | "Megabytes/Second" | "Gigabytes/Second" | "Terabytes/Second" | "Bits/Second" | "Kilobits/Second" | "Megabits/Second" | "Gigabits/Second" | "Terabits/Second" | "Count/Second" | "None";

    export interface IMetricOptions {
        enabled?: boolean;
        /** In milliseconds */
        sendInterval?: number;
        sendCallback?: (err?: Error) => void;
        maxCapacity?: number;
        withTimestamp?: true;
        storageResolution?: 1 | 60;
    }

    export class Metric {
        constructor(namespace: string, units: MetricUnit, defaultDimensions: Array<IDimension>, options: IMetricOptions);

        put(value: number, metric: string, units: MetricUnit, additionalDimensions?: Array<IDimension>): void;
        put(value: number, metric: string, additionalDimensions?: Array<IDimension>): void;

        summaryPut(value: number, metric: string, units: MetricUnit, additionalDimensions?: Array<IDimension>): void;
        summaryPut(value: number, metric: string, additionalDimensions?: Array<IDimension>): void;

        put(value: number, metric: string, units: MetricUnit, additionalDimensions: Array<IDimension>, sampleRate: number): void;
        put(value: number, metric: string, additionalDimensions: Array<IDimension>, sampleRate: number): void;

        shutdown(): void;

        hasMetrics(): boolean;
    }
}