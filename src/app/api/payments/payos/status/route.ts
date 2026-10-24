import { NextResponse } from "next/server";
import { internalApiError } from "@/lib/http";
import { isPayosConfigurationReady } from "@/lib/payos";

export async function GET(request: Request) {
	try {
		return NextResponse.json({ ready: isPayosConfigurationReady() }, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (error) {
		return internalApiError(request, error, "Không thể kiểm tra trạng thái PayOS");
	}
}
