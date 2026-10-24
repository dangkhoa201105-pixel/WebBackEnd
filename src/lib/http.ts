import { NextResponse } from "next/server";

export function internalApiError(request: Request, error: unknown, message = "Đã xảy ra lỗi máy chủ") {
	const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
	const errorCode = error && typeof error === "object" && "code" in error && typeof error.code === "string"
		? error.code
		: undefined;
	console.error(JSON.stringify({
		event: "api_request_failed",
		requestId,
		method: request.method,
		path: new URL(request.url).pathname,
		errorName: error instanceof Error ? error.name : "UnknownError",
		...(errorCode ? { errorCode } : {}),
		timestamp: new Date().toISOString(),
	}));
	return NextResponse.json(
		{ message, requestId },
		{ status: 500, headers: { "x-request-id": requestId } },
	);
}
