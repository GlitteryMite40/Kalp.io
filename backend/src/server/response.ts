import { NextResponse } from "next/server";
import { HTTP_STATUS } from "@/lib/constants";
import { ApiError } from "@/lib/errors";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: Record<string, unknown>;
}

export function jsonSuccess<T>(
  data: T,
  status = HTTP_STATUS.OK,
  meta?: Record<string, unknown>,
) {
  const body: ApiResponse<T> = {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };
  return NextResponse.json(body, { status });
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    const body: ApiResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
    return NextResponse.json(body, { status: error.statusCode });
  }

  const message =
    error instanceof Error ? error.message : "Internal Server Error";
  const body: ApiResponse = {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message,
    },
  };
  return NextResponse.json(body, { status: HTTP_STATUS.INTERNAL_SERVER_ERROR });
}
