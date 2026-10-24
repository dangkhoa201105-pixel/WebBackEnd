import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(_: Request, context: Context) {
	const session = await requireStaff();
	if (!session) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	const { id } = await context.params;
	try {
		const order = await prisma.$transaction(async (tx) => {
			const current = await tx.order.findUnique({ where: { id } });
			if (!current) throw new Error("ORDER_NOT_FOUND");
			if (current.status !== "CONFIRMED" || current.paymentMethod !== "CASH" || current.paymentStatus !== "PENDING") {
				throw new Error("PAYMENT_CANNOT_CONFIRM");
			}
			const updated = await tx.order.updateMany({
				where: { id, status: "CONFIRMED", paymentMethod: "CASH", paymentStatus: "PENDING" },
				data: { paymentStatus: "PAID" },
			});
			if (updated.count !== 1) throw new Error("PAYMENT_CANNOT_CONFIRM");
			await writeAuditLog(tx, { actorId: session.userId, action: "order.payment_received", entity: "order", entityId: id });
			return tx.order.findUnique({ where: { id }, include: { items: true } });
		});
		return NextResponse.json(order);
	} catch (error) {
		if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
			return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "PAYMENT_CANNOT_CONFIRM") {
			return NextResponse.json({ message: "Chỉ xác nhận được đơn tiền mặt chưa thanh toán" }, { status: 409 });
		}
		throw error;
	}
}
