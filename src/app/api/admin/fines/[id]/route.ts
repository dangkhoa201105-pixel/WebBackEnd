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
		const fine = await prisma.$transaction(async (tx) => {
			const existing = await tx.fine.findUnique({ where: { id } });
			if (!existing) throw new Error("FINE_NOT_FOUND");
			if (existing.paidAt) throw new Error("FINE_ALREADY_PAID");
			const updated = await tx.fine.update({ where: { id }, data: { paidAt: new Date() } });
			await writeAuditLog(tx, { actorId: session.userId, action: "fine.paid", entity: "fine", entityId: id });
			return updated;
		});
		return NextResponse.json(fine);
	} catch (error) {
		if (error instanceof Error && error.message === "FINE_NOT_FOUND") {
			return NextResponse.json({ message: "Không tìm thấy khoản phạt" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "FINE_ALREADY_PAID") {
			return NextResponse.json({ message: "Khoản phạt đã được thanh toán" }, { status: 409 });
		}
		throw error;
	}
}
