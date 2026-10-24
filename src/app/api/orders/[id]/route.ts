import { NextResponse } from "next/server";
import { getSession, requireStaff } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordInventoryMovement } from "@/lib/library";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(_: Request, context: Context) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	const staff = await requireStaff();
	const { id } = await context.params;

	try {
		await prisma.$transaction(async (tx) => {
			const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
			if (!order) throw new Error("ORDER_NOT_FOUND");
			if (!staff && order.userId !== session.userId) throw new Error("FORBIDDEN");
			if (order.paymentMethod !== "CASH") throw new Error("ORDER_CANNOT_CANCEL");
			if (order.status !== "CONFIRMED" || order.paymentStatus === "PAID") throw new Error("ORDER_CANNOT_CANCEL");
			const changed = await tx.order.updateMany({
				where: { id, status: "CONFIRMED", paymentStatus: "PENDING" },
				data: { status: "CANCELLED" },
			});
			if (changed.count !== 1) throw new Error("ORDER_CANNOT_CANCEL");
			for (const item of order.items) {
				await tx.book.update({ where: { id: item.bookId }, data: { saleStock: { increment: item.quantity } } });
				await recordInventoryMovement(tx, {
					bookId: item.bookId,
					actorId: session.userId,
					type: "SALE_RETURN",
					quantity: item.quantity,
					notes: "Hoàn lại tồn kho khi hủy đơn chưa thanh toán",
					metadata: { orderId: id },
				});
			}
			await writeAuditLog(tx, { actorId: session.userId, action: "order.cancelled", entity: "order", entityId: id });
		});
		return NextResponse.json({ ok: true, status: "CANCELLED" });
	} catch (error) {
		if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
			return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "FORBIDDEN") {
			return NextResponse.json({ message: "Bạn không có quyền hủy đơn hàng này" }, { status: 403 });
		}
		if (error instanceof Error && error.message === "ORDER_CANNOT_CANCEL") {
			return NextResponse.json({ message: "Đơn hàng đã thanh toán hoặc không thể hủy" }, { status: 409 });
		}
		throw error;
	}
}
