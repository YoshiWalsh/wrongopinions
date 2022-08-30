import { serializeError } from 'serialize-error';
import { Contracts } from "wrongopinions-common";

export class ResponseError extends Error {
    code: number;
    details: string = "";
    data: any = null;

    constructor(code: number, message: string) {
        super(message);
        this.code = code;
    }
}

export class UnknownError extends ResponseError {
    constructor(ex: Error) {
        super(500, "Unknown server error");
        this.data = serializeError(ex);
    }
}

export function convertExceptionToResponse(ex: Error): Contracts.ErrorResponse {
    const error = ex instanceof ResponseError ? ex : new UnknownError(ex);

    return {
        class: error.constructor.name,
        code: error.code,
        message: error.message,
        details: error.details,
        data: error.data,
    };
}