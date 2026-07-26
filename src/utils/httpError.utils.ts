// Thrown from controllers/services when a specific HTTP status code needs to reach
// the response (instead of the generic 500 errorMiddleware falls back to for
// unexpected errors).
export class HttpError extends Error {
    statusCode: number;

    constructor(statusCode: number, message: string) {
        super(message);
        this.name = "HttpError";
        this.statusCode = statusCode;
    }
}
