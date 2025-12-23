export interface ErrorDetail {
    field: string;
    code: string;
    message: string;
}

export interface StandardErrorResponse {
    statusCode: number;
    error: string;
    message: string;
    details?: ErrorDetail[];
    path?: string;
    timestamp: string;
}

