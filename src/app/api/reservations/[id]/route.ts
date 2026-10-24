import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { expireReadyReservations, promoteNextReservation, refreshBookInventory } from "@/lib/library";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, context: Context) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	const staff = session.role === "ADMIN" || session.role === "LIBRARIAN";
	const { id } = await context.params;
	try {
		const reservation = await prisma.$transaction(async (tx) => {
			await expireReadyReservations(tx);
			const current = await tx.reservation.findUnique({ where: { id } });
			if (!current) throw new Error("RESERVATION_NOT_FOUND");
			if (!staff && current.userId !== session.userId) throw new Error("FORBIDDEN");
			if (current.status !== "WAITING" && current.status !== "READY") throw new Error("RESERVATION_NOT_ACTIVE");
			const changed = await tx.reservation.updateMany({
				where: { id, status: current.status },
				data: { status: "CANCELLED", copyId: null, readyUntil: null },
			});
			if (changed.count !== 1) throw new Error("RESERVATION_NOT_ACTIVE");
			if (current.status === "READY" && current.copyId) {
				await promoteNextReservation(tx, current.bookId, current.copyId, session.userId);
				await refreshBookInventory(tx, current.bookId);
			}
			await writeAuditLog(tx, { actorId: session.userId, action: "reservation.cancelled", entity: "reservation", entityId: id });
			return tx.reservation.findUniqueOrThrow({ where: { id } });
		});
		return NextResponse.json(reservation);
	} catch (error) {
		if (error instanceof Error && error.message === "RESERVATION_NOT_FOUND") {
			return NextResponse.json({ message: "Không tìm thấy yêu cầu đặt trước" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "FORBIDDEN") {
			return NextResponse.json({ message: "Bạn không có quyền hủy yêu cầu này" }, { status: 403 });
		}
		if (error instanceof Error && error.message === "RESERVATION_NOT_ACTIVE") {
			return NextResponse.json({ message: "Yêu cầu không còn ở trạng thái chờ hoặc sẵn sàng" }, { status: 409 });
		}
		throw error;
	}
}
