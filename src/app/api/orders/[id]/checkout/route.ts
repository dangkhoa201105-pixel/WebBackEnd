import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { internalApiError } from "@/lib/http";
import { getPayosConfiguration, PayosConfigurationError } from "@/lib/payos";
import { createPayosCheckout, isKnownPayosOrderError } from "@/lib/payos-orders";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	try {
		getPayosConfiguration();
	} catch (error) {
		if (error instanceof PayosConfigurationError) {
			return NextResponse.json({ message: "Thanh toán PayOS đang tắt hoặc chưa được cấu hình đầy đủ" }, { status: 503 });
		}
		return internalApiError(request, error, "Không thể khởi tạo thanh toán PayOS");
	}

	const { id } = await context.params;
	const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
	if (!order) return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
	if (order.userId !== session.userId) return NextResponse.json({ message: "Bạn không có quyền thanh toán đơn hàng này" }, { status: 403 });
	try {
		const checkoutUrl = await createPayosCheckout(order);
		return NextResponse.json({ orderId: order.id, checkoutUrl });
	} catch (error) {
		if (isKnownPayosOrderError(error)) {
			return NextResponse.json({ message: "Đơn hàng không còn đủ điều kiện thanh toán" }, { status: 409 });
		}
		internalApiError(request, error, "Không thể tạo link PayOS");
		return NextResponse.json({ message: "Chưa tạo được link PayOS; hãy thử lại sau" }, { status: 502 });
	}
}
