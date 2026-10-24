import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordInventoryMovement } from "@/lib/library";
import { prisma } from "@/lib/prisma";
import { getRentalQuote, RENTAL_PERIOD_DAYS } from "@/lib/rental-pricing";

type Context = { params: Promise<{ id: string }> };
const schema = z.object({ days: z.literal(RENTAL_PERIOD_DAYS).default(RENTAL_PERIOD_DAYS) });

export async function POST(request: Request, context: Context) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	let body: unknown = {};
	try {
		const text = await request.text();
		body = text ? JSON.parse(text) : {};
	} catch {
		return NextResponse.json({ message: "Thời hạn mượn không hợp lệ" }, { status: 400 });
	}
	const input = schema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Thời hạn mượn không hợp lệ" }, { status: 400 });
	const { id } = await context.params;

	try {
		const rental = await prisma.$transaction(async (tx) => {
			const reservation = await tx.reservation.findUnique({
				where: { id },
				include: { book: { select: { salePrice: true } } },
			});
			if (!reservation) throw new Error("RESERVATION_NOT_FOUND");
			if (reservation.userId !== session.userId) throw new Error("FORBIDDEN");
			if (reservation.status !== "READY" || !reservation.copyId || !reservation.readyUntil || reservation.readyUntil <= new Date()) {
				throw new Error("RESERVATION_EXPIRED");
			}
			const copy = await tx.bookCopy.findUnique({ where: { id: reservation.copyId } });
			if (!copy || copy.status !== "RESERVED") throw new Error("COPY_NOT_RESERVED");
			const quote = getRentalQuote(reservation.book.salePrice, "OFFLINE");
			const changed = await tx.reservation.updateMany({
				where: { id, userId: session.userId, status: "READY", readyUntil: { gt: new Date() } },
				data: { status: "FULFILLED" },
			});
			if (changed.count !== 1) throw new Error("RESERVATION_EXPIRED");
			await tx.bookCopy.update({ where: { id: copy.id }, data: { status: "ON_LOAN", condition: "ON_LOAN" } });
			const startDate = new Date();
			const dueDate = new Date(startDate.getTime() + RENTAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);
			const created = await tx.rental.create({
				data: {
					userId: session.userId,
					bookId: reservation.bookId,
					rentalMode: "OFFLINE",
					copyId: copy.id,
					startDate,
					dueDate,
					days: RENTAL_PERIOD_DAYS,
					total: quote.rentalFee,
					amountPaid: quote.amountDue,
					refundableDeposit: quote.refundableDeposit,
					paidAt: startDate,
					status: "ACTIVE",
				},
				include: { book: { select: { id: true, title: true, author: true, coverUrl: true } } },
			});
			await recordInventoryMovement(tx, {
				bookId: reservation.bookId,
				copyId: copy.id,
				actorId: session.userId,
				type: "LOAN",
				quantity: 0,
				notes: "Xác nhận mượn bản sách đã đặt trước",
				metadata: { reservationId: reservation.id },
			});
			await writeAuditLog(tx, { actorId: session.userId, action: "reservation.claimed", entity: "reservation", entityId: id });
			await writeAuditLog(tx, {
				actorId: session.userId,
				action: "loan.created",
				entity: "rental",
				entityId: created.id,
				metadata: { rentalMode: "OFFLINE", rentalFee: quote.rentalFee, amountPaid: quote.amountDue, refundableDeposit: quote.refundableDeposit },
			});
			return created;
		});
		return NextResponse.json(rental, { status: 201 });
	} catch (error) {
		if (error instanceof Error && error.message === "RESERVATION_NOT_FOUND") {
			return NextResponse.json({ message: "Không tìm thấy yêu cầu đặt trước" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "FORBIDDEN") {
			return NextResponse.json({ message: "Bạn không có quyền nhận yêu cầu này" }, { status: 403 });
		}
		if (error instanceof Error && error.message === "RESERVATION_EXPIRED") {
			return NextResponse.json({ message: "Yêu cầu đặt trước đã hết hạn hoặc không còn sẵn sàng" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "COPY_NOT_RESERVED") {
			return NextResponse.json({ message: "Bản sách đang được kiểm kê, vui lòng liên hệ nhân viên" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "BOOK_PRICE_MUST_BE_POSITIVE") {
			return NextResponse.json({ message: "Sách chưa được cấu hình giá bán để tính giá thuê và khoản cọc" }, { status: 409 });
		}
		throw error;
	}
}
