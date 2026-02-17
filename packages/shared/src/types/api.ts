export interface ApiResponse<T> {
  data: T;
  meta?: {
    cursor?: string;
    hasMore?: boolean;
    total?: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;
