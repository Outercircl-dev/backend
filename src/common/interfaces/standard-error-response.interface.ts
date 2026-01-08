export interface ErrorDetail {
    field: string;
    code: string;
    message: string;
}

export interface StandardErrorResponse {
    statusCode: number;
    message: string;
    path: string;
    details: ErrorDetail[];
    timestamp: string;
}

