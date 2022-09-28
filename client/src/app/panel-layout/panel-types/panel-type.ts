export interface PossibleSize {
    rows: number;
    columns: number;
    interest: number;
    baseInterest: number;
}

export abstract class Panel {
    abstract getPossibleSizes(): Array<PossibleSize>
}