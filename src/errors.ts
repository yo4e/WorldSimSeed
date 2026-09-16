export type WorldSimErrorCode =
  | "PARSE_ERROR"
  | "SCHEMA_ERROR"
  | "SEMANTIC_ERROR"
  | "EXPRESSION_ERROR"
  | "NUMERIC_ERROR"
  | "RESOURCE_LIMIT"
  | "RUN_COMPLETE";

export class WorldSimError extends Error {
  readonly code: WorldSimErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: WorldSimErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorldSimError";
    this.code = code;
    this.details = details;
  }
}
