import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { promoteNextReservation, recordInventoryMovement, refreshBookInventory } from "@/lib/library";
import { getOfflineDepositRefund } from "@/lib/rental-pricing";
import { prisma } from "@/lib/prisma";
import { internalApiError } from "@/lib/http";

const schema = z.object({ condition: z.enum(["GOOD", "DAMAGED", "LOST"]).default("GOOD") });
type Context = { params: Promise<{ id: string }> };
const overdueFinePerDay = 5000;
const conditionFine = { GOOD: 0, DAMAGED: 100000, LOST: 300000 } as const;

export async function POST(request: Request, context: Context) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	const staff = session.role === "ADMIN" || session.role === "LIBRARIAN";
	let body: unknown = {};
	try {
		const text = await request.text();
		body = text ? JSON.parse(text) : {};
	} catch {
		return NextResponse.json({ message: "Dữ liệu trả sách không hợp lệ" }, { status: 400 });
	}
	const input = schema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Tình trạng sách không hợp lệ" }, { status: 400 });

	const { id } = await context.params;
	try {
		const result = await prisma.$transaction(async (tx) => {
			const rental = await tx.rental.findUnique({ where: { id } });
			if (!rental) throw new Error("LOAN_NOT_FOUND");
			if (rental.rentalMode !== "OFFLINE") throw new Error("LOAN_NOT_PHYSICAL");
			if (!staff) throw new Error("FORBIDDEN");
			if (rental.status !== "ACTIVE") throw new Error("LOAN_NOT_ACTIVE");

			const returnedAt = new Date();
			const overdueDays = Math.max(0, Math.ceil((returnedAt.getTime() - rental.dueDate.getTime()) / (24 * 60 * 60 * 1000)));
			const hasDeposit = rental.refundableDeposit > 0 && rental.paidAt !== null;
			const refundAmount = hasDeposit
				? getOfflineDepositRefund(
					rental.refundableDeposit,
					rental.dueDate,
					returnedAt,
					rental.depositForfeitedAt !== null || input.data.condition === "LOST",
				)
				: 0;
			const overdueFine = hasDeposit ? 0 : overdueDays * overdueFinePerDay;
			const conditionAmount = hasDeposit && input.data.condition === "LOST" ? 0 : conditionFine[input.data.condition];
			const amount = overdueFine + conditionAmount;
			const updated = await tx.rental.updateMany({
				where: { id, status: "ACTIVE" },
				data: {
					status: "RETURNED",
					returnedAt,
					...(hasDeposit ? {
						refundedAmount: refundAmount,
						refundedAt: refundAmount > 0 ? returnedAt : null,
						depositForfeitedAt: refundAmount === 0 ? rental.depositForfeitedAt ?? rental.dueDate : null,
					} : {}),
				},
			});
			if (updated.count !== 1) throw new Error("LOAN_NOT_ACTIVE");

			if (rental.copyId) {
				const copy = await tx.bookCopy.findUnique({ where: { id: rental.copyId } });
				if (!copy || copy.status !== "ON_LOAN") throw new Error("BOOK_STOCK_INCONSISTENT");
				if (input.data.condition === "LOST") {
					await tx.bookCopy.update({ where: { id: copy.id }, data: { status: "LOST", condition: "LOST" } });
					await recordInventoryMovement(tx, { bookId: rental.bookId, copyId: copy.id, actorId: session.userId, type: "LOST", quantity: -1 });
					await refreshBookInventory(tx, rental.bookId);
				} else if (input.data.condition === "DAMAGED") {
					await tx.bookCopy.update({ where: { id: copy.id }, data: { status: "DAMAGED", condition: "DAMAGED" } });
					await recordInventoryMovement(tx, { bookId: rental.bookId, copyId: copy.id, actorId: session.userId, type: "DAMAGED", quantity: 0 });
					await refreshBookInventory(tx, rental.bookId);
				} else {
					await tx.bookCopy.update({ where: { id: copy.id }, data: { status: "AVAILABLE", condition: "GOOD" } });
					await recordInventoryMovement(tx, { bookId: rental.bookId, copyId: copy.id, actorId: session.userId, type: "RETURN", quantity: 1 });
					await promoteNextReservation(tx, rental.bookId, copy.id, session.userId);
				}
			} else if (input.data.condition === "LOST") {
				const removed = await tx.book.updateMany({ where: { id: rental.bookId, stock: { gt: 0 } }, data: { stock: { decrement: 1 } } });
				if (removed.count !== 1) throw new Error("BOOK_STOCK_INCONSISTENT");
			} else if (input.data.condition === "GOOD") {
				await tx.book.update({ where: { id: rental.bookId }, data: { available: { increment: 1 } } });
			}

			const fine = amount > 0
				? await tx.fine.create({
					data: {
						rentalId: rental.id,
						amount,
						reason: [
							...(overdueDays ? [`Quá hạn ${overdueDays} ngày`] : []),
							...(input.data.condition === "DAMAGED" ? ["Sách bị hư hỏng"] : []),
							...(input.data.condition === "LOST" ? ["Sách bị mất"] : []),
						].join("; "),
					},
				})
				: null;
			await writeAuditLog(tx, {
				actorId: session.userId,
				action: "loan.returned",
				entity: "rental",
				entityId: rental.id,
				metadata: { condition: input.data.condition, fineAmount: amount, refundAmount, overdueDays },
			});
			return { rentalId: rental.id, returnedAt, overdueDays, refundAmount, refundSimulated: refundAmount > 0, fine };
		});
		return NextResponse.json(result);
	} catch (error) {
		if (error instanceof Error && error.message === "LOAN_NOT_FOUND") {
			return NextResponse.json({ message: "Không tìm thấy phiếu mượn" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "FORBIDDEN") {
			return NextResponse.json({ message: "Bạn không có quyền trả phiếu mượn này" }, { status: 403 });
		}
		if (error instanceof Error && error.message === "LOAN_NOT_PHYSICAL") {
			return NextResponse.json({ message: "Phiếu thuê online tự hết hạn, không cần trả bản sách vật lý" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "LOAN_NOT_ACTIVE") {
			return NextResponse.json({ message: "Phiếu mượn không còn ở trạng thái đang mượn" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "BOOK_STOCK_INCONSISTENT") {
			return NextResponse.json({ message: "Tồn kho sách không nhất quán; chưa thể ghi nhận trả sách" }, { status: 409 });
		}
		return internalApiError(request, error, "Không thể ghi nhận trả sách lúc này");
	}
}
