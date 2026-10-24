import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordInventoryMovement, refreshBookInventory } from "@/lib/library";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };
const schema = z.object({
	status: z.enum(["AVAILABLE", "DAMAGED", "MAINTENANCE", "DISPOSED"]),
	condition: z.enum(["GOOD", "DAMAGED", "MAINTENANCE"]).optional(),
	notes: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(request: Request, context: Context) {
	const session = await requireStaff();
	if (!session) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Dữ liệu bản sách không hợp lệ" }, { status: 400 });
	}
	const input = schema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Trạng thái hoặc ghi chú bản sách không hợp lệ" }, { status: 400 });
	const { id } = await context.params;

	try {
		const updated = await prisma.$transaction(async (tx) => {
			const copy = await tx.bookCopy.findUnique({ where: { id } });
			if (!copy) throw new Error("COPY_NOT_FOUND");
			if (copy.status === "ON_LOAN" || copy.status === "RESERVED") throw new Error("COPY_IN_USE");
			if (copy.status === "LOST" || copy.status === "DISPOSED") throw new Error("COPY_CLOSED");

			const nextStatus = input.data.status;
			if (nextStatus === "AVAILABLE" && copy.status !== "DAMAGED" && copy.status !== "MAINTENANCE" && copy.status !== "AVAILABLE") {
				throw new Error("INVALID_REPAIR_TRANSITION");
			}
			if (nextStatus === "DAMAGED" && copy.status !== "AVAILABLE" && copy.status !== "DAMAGED") {
				throw new Error("INVALID_DAMAGE_TRANSITION");
			}
			const condition = input.data.condition ?? (
				nextStatus === "AVAILABLE" ? "GOOD" :
				nextStatus === "DAMAGED" ? "DAMAGED" :
				nextStatus === "MAINTENANCE" ? "MAINTENANCE" :
				copy.condition
			);
			const result = await tx.bookCopy.update({
				where: { id },
				data: { status: nextStatus, condition, ...(input.data.notes !== undefined ? { notes: input.data.notes } : {}) },
			});
			const movementType = nextStatus === "AVAILABLE"
				? (copy.status === "DAMAGED" || copy.status === "MAINTENANCE" ? "REPAIRED" : "ADJUSTMENT")
				: nextStatus === "DAMAGED" ? "DAMAGED"
				: nextStatus === "DISPOSED" ? "DISPOSED"
				: "ADJUSTMENT";
			await recordInventoryMovement(tx, {
				bookId: copy.bookId,
				copyId: id,
				actorId: session.userId,
				type: movementType,
				quantity: nextStatus === "DISPOSED" ? -1 : 0,
				notes: input.data.notes ?? `Trạng thái bản sách: ${copy.status} → ${nextStatus}`,
				metadata: { previousStatus: copy.status, nextStatus, condition },
			});
			await refreshBookInventory(tx, copy.bookId);
			await writeAuditLog(tx, {
				actorId: session.userId,
				action: "inventory.copy_status_changed",
				entity: "book_copy",
				entityId: id,
				metadata: { previousStatus: copy.status, nextStatus },
			});
			return result;
		});
		return NextResponse.json(updated);
	} catch (error) {
		if (error instanceof Error && error.message === "COPY_NOT_FOUND") {
			return NextResponse.json({ message: "Không tìm thấy bản sách" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "COPY_IN_USE") {
			return NextResponse.json({ message: "Không thể thay đổi trạng thái khi bản sách đang mượn hoặc được giữ cho đặt trước" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "COPY_CLOSED") {
			return NextResponse.json({ message: "Bản sách đã mất hoặc thanh lý không thể đổi trạng thái" }, { status: 409 });
		}
		if (error instanceof Error && error.message.startsWith("INVALID_")) {
			return NextResponse.json({ message: "Chuyển trạng thái bản sách không hợp lệ" }, { status: 409 });
		}
		throw error;
	}
}
