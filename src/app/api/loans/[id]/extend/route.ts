import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { internalApiError } from "@/lib/http";

const schema = z.object({ days: z.union([z.literal(3), z.literal(7), z.literal(14), z.literal(30)]) });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	const staff = session.role === "ADMIN" || session.role === "LIBRARIAN";
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Thời hạn gia hạn không hợp lệ" }, { status: 400 });
	}
	const input = schema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Số ngày gia hạn phải là 3, 7, 14 hoặc 30" }, { status: 400 });
	const { id } = await context.params;

	try {
		const rental = await prisma.$transaction(async (tx) => {
			const current = await tx.rental.findUnique({ where: { id } });
			if (!current) throw new Error("LOAN_NOT_FOUND");
			if (!staff && current.userId !== session.userId) throw new Error("FORBIDDEN");
			if (current.amountPaid > 0 || current.refundableDeposit > 0) throw new Error("FIXED_TERM_RENTAL");
			if (current.status !== "ACTIVE" || current.extendedCount > 0 || current.dueDate < new Date()) {
				throw new Error("LOAN_CANNOT_EXTEND");
			}
			const dueDate = new Date(current.dueDate.getTime() + input.data.days * 24 * 60 * 60 * 1000);
			const updated = await tx.rental.updateMany({
				where: { id, status: "ACTIVE", extendedCount: 0 },
				data: { dueDate, extendedCount: { increment: 1 } },
			});
			if (updated.count !== 1) throw new Error("LOAN_CANNOT_EXTEND");
			await writeAuditLog(tx, {
				actorId: session.userId,
				action: "loan.extended",
				entity: "rental",
				entityId: id,
				metadata: { days: input.data.days },
			});
			return tx.rental.findUnique({ where: { id } });
		});
		return NextResponse.json(rental);
	} catch (error) {
		if (error instanceof Error && error.message === "LOAN_NOT_FOUND") {
			return NextResponse.json({ message: "Không tìm thấy phiếu mượn" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "FORBIDDEN") {
			return NextResponse.json({ message: "Bạn không có quyền gia hạn phiếu mượn này" }, { status: 403 });
		}
		if (error instanceof Error && error.message === "LOAN_CANNOT_EXTEND") {
			return NextResponse.json({ message: "Chỉ được gia hạn một lần cho phiếu mượn đang hạn" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "FIXED_TERM_RENTAL") {
			return NextResponse.json({ message: "Gói thuê mới có thời hạn cố định 7 ngày và không hỗ trợ gia hạn" }, { status: 409 });
		}
		return internalApiError(request, error, "Không thể gia hạn phiếu mượn lúc này");
	}
}
