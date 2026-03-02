export type ApiErrorBody = {
  success: false;
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path?: string;
  details?: unknown;
};

export function buildApiErrorBody(params: {
  statusCode: number;
  message: string;
  error: string;
  path?: string;
  details?: unknown;
}): ApiErrorBody {
  const body: ApiErrorBody = {
    success: false,
    statusCode: params.statusCode,
    message: params.message,
    error: params.error,
    timestamp: new Date().toISOString(),
  };

  if (params.path) body.path = params.path;
  if (params.details !== undefined) body.details = params.details;

  return body;
}
