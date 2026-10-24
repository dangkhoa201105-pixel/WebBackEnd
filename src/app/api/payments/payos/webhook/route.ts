import { NextResponse } from "next/server";
import { PayosConfigurationError, verifyPayosWebhook } from "@/lib/payos";
import { applyPayosPayment } from "@/lib/payos-orders";
import { internalApiError } from "@/lib/http";

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Webhook không hợp lệ" }, { status: 400 });
	}

	let payment;
	try {
		payment = await verifyPayosWebhook(body);
	} catch (error) {
		if (error instanceof PayosConfigurationError) {
			return NextResponse.json({ message: "Webhook PayOS chưa được cấu hình" }, { status: 503 });
		}
		if (error instanceof Error && error.message === "INVALID_PAYOS_WEBHOOK") {
			return NextResponse.json({ message: "Webhook PayOS không đúng định dạng" }, { status: 400 });
		}
		return NextResponse.json({ message: "Chữ ký webhook PayOS không hợp lệ" }, { status: 400 });
	}

	if (body && typeof body === "object" && "success" in body && body.success === true && payment.code === "00") {
		if (payment.currency !== "VND" || !Number.isSafeInteger(payment.orderCode) || !Number.isSafeInteger(payment.amount)) {
			return NextResponse.json({ message: "Thông tin thanh toán PayOS không hợp lệ" }, { status: 400 });
		}
		try {
			await applyPayosPayment({
				orderCode: payment.orderCode,
				amount: payment.amount,
				paymentLinkId: payment.paymentLinkId,
				reference: payment.reference,
			});
		} catch (error) {
			if (error instanceof Error && error.message === "PAYOS_ORDER_NOT_FOUND") {
				return NextResponse.json({ message: "Không tìm thấy đơn PayOS tương ứng" }, { status: 404 });
			}
			if (error instanceof Error && [
				"PAYOS_AMOUNT_MISMATCH",
				"PAYOS_LINK_MISMATCH",
				"PAYOS_ORDER_NOT_PAYABLE",
			].includes(error.message)) {
				return NextResponse.json({ message: "Thông tin thanh toán không khớp với đơn hàng" }, { status: 409 });
			}
			return internalApiError(request, error, "Không thể cập nhật trạng thái thanh toán");
		}
	}
	return NextResponse.json({ success: true });
}
