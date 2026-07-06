export class AppError extends Error {
  statusCode: number;
  status: 'fail' | 'error';
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Define the type using intersection instead of extending a class
export type AppErrorType = Error & {
  statusCode: number;
  status: "fail" | "error";
  isOperational: boolean;
};

// Factory function to create an error without using the 'new' keyword or classes
export const createAppError = (
  message: string,
  statusCode: number,
): AppErrorType => {
  const error = new Error(message) as AppErrorType;

  error.statusCode = statusCode;
  error.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
  error.isOperational = true;

  // Maintains proper stack trace for where our error was generated
  Error.captureStackTrace(error, createAppError);

  return error;
};
