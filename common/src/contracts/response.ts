export interface SuccessResponse<T> {
    data: T;
}

export interface ErrorResponse {
    class: string;
    code: number;
    message: string;
    details: string;
    data: any;
}