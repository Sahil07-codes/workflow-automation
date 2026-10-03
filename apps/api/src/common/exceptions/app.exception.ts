/**
 * Custom application exception for standardized error handling
 */
export class AppException extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppException.prototype);
  }
}
