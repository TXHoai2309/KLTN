export type MutationStatus = "SUCCESS" | "FAILED" | "UNKNOWN";

export type MutationError = {
  code: string;
  message: string;
  details?: unknown;
};

export type MutationOutcome<T> =
  | { status: "SUCCESS"; data: T; replayed?: boolean }
  | { status: "FAILED"; error: MutationError; httpStatus?: number }
  | {
      status: "UNKNOWN";
      error: MutationError;
      retryWithSameKey: true;
    };

export type MutationApiResponse<T> =
  | { success: true; operationStatus: "SUCCESS"; data: T }
  | {
      success: false;
      operationStatus: "FAILED" | "UNKNOWN";
      error: MutationError;
      retryWithSameKey?: true;
    };
