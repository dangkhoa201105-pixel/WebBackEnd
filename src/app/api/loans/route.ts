import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordInventoryMovement, refreshBookInventory, takeAvailableCopy } from "@/lib/library";
import { internalApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getRentalQuote, RENTAL_PERIOD_DAYS } from "@/lib/rental-pricing";

const singleLoanSchema = z.object({
	bookId: z.string().min(1),
	days: z.literal(RENTAL_PERIOD_DAYS),
});
const batchLoanSchema = z.object({
	items: z.array(singleLoanSchema).min(1).max(20),
});
const createLoanSchema = z.union([
	singleLoanSchema.extend({ rentalMode: z.enum(["ONLINE", "OFFLINE"]).default("OFFLINE") }),
	batchLoanSchema.extend({ rentalMode: z.enum(["ONLINE", "OFFLINE"]).default("OFFLINE") }),
]);

export async function GET(request: Request) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	const url = new URL(request.url);
	const requestedPage = Number(url.searchParams.get("page") ?? 1);
	const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
	const page = Number.isFinite(requestedPage) ? Math.max(Math.floor(requestedPage), 1) : 1;
	const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 50) : 20;
	const staff = session.role === "ADMIN" || session.role === "LIBRARIAN";
	const userId = staff ? url.searchParams.get("userId") : session.userId;
	const status = z.enum(["PENDING", "ACTIVE", "RETURNED", "CANCELLED", "EXPIRED"]).safeParse(url.searchParams.get("status"));
	const where: Prisma.RentalWhereInput = {
		...(userId ? { userId } : {}),
		...(status.success ? { status: status.data } : {}),
	};

	const [data, total] = await Promise.all([
		prisma.rental.findMany({
			where,
			include: { book: { select: { id: true, title: true, author: true, coverUrl: true } }, user: { select: { id: true, name: true, email: true } }, fine: true },
			orderBy: { createdAt: "desc" },
			skip: (page - 1) * limit,
			take: limit,
		}),
		prisma.rental.count({ where }),
	]);
	return NextResponse.json({ data, meta: { page, limit, total } });
}

export async function POST(request: Request) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Dữ liệu mượn sách không hợp lệ" }, { status: 400 });
	}
	const input = createLoanSchema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Gói thuê mới có thời hạn cố định 7 ngày; vui lòng kiểm tra sách và loại thuê" }, { status: 400 });
	const items = "items" in input.data ? input.data.items : [input.data];
	const rentalMode = input.data.rentalMode;
	if (new Set(items.map((item) => item.bookId)).size !== items.length) {
		return NextResponse.json({ message: "Mỗi sách chỉ được xuất hiện một lần trong yêu cầu mượn" }, { status: 400 });
	}
	const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? null;
	if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 128)) {
		return NextResponse.json({ message: "Idempotency-Key phải có độ dài từ 8 đến 128 ký tự" }, { status: 400 });
	}
	const requestHash = createHash("sha256")
		.update(JSON.stringify({ rentalMode, items: [...items].sort((a, b) => a.bookId.localeCompare(b.bookId)) }))
		.digest("hex");
	if (idempotencyKey) {
		const previous = await prisma.loanRequest.findUnique({
			where: { userId_idempotencyKey: { userId: session.userId, idempotencyKey } },
			include: { rentals: { include: { book: { select: { id: true, title: true, author: true, coverUrl: true } } }, orderBy: { bookId: "asc" } } },
		});
		if (previous) {
			if (previous.requestHash !== requestHash || previous.rentals.length !== items.length) {
				return NextResponse.json({ message: "Idempotency-Key đã được dùng cho yêu cầu khác" }, { status: 409 });
			}
			return NextResponse.json({ data: previous.rentals });
		}
	}

	const startDate = new Date();
	try {
		const rentals = await prisma.$transaction(async (tx) => {
			const loanRequest = idempotencyKey
				? await tx.loanRequest.create({
					data: { userId: session.userId, idempotencyKey, requestHash },
				})
				: null;
			const bookIds = items.map((item) => item.bookId);
			const books = await tx.book.findMany({ where: { id: { in: bookIds } } });
			if (books.length !== bookIds.length) throw new Error("BOOK_NOT_FOUND");
			const createdRentals: Array<Awaited<ReturnType<typeof tx.rental.create>>> = [];
			for (const item of items) {
				const book = books.find((candidate) => candidate.id === item.bookId);
				if (!book) throw new Error("BOOK_NOT_FOUND");
				if (book.salePrice <= 0) throw new Error("BOOK_PRICE_UNAVAILABLE");
				if (rentalMode === "ONLINE" && !book.hasDigitalContent) throw new Error("DIGITAL_CONTENT_UNAVAILABLE");
				const copy = rentalMode === "OFFLINE" ? await takeAvailableCopy(tx, book.id) : null;
				if (rentalMode === "OFFLINE" && !copy) throw new Error("BOOK_UNAVAILABLE");
				if (rentalMode === "OFFLINE") {
					const waitingReservations = await tx.reservation.count({ where: { bookId: book.id, status: "WAITING" } });
					if (waitingReservations > 0) throw new Error("BOOK_HAS_WAITING_RESERVATIONS");
				}
				const quote = getRentalQuote(book.salePrice, rentalMode);
				const dueDate = new Date(startDate.getTime() + RENTAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);
				const rental = await tx.rental.create({
					data: {
						userId: session.userId,
						bookId: book.id,
						rentalMode,
						startDate,
						dueDate,
						days: RENTAL_PERIOD_DAYS,
						total: quote.rentalFee,
						amountPaid: quote.amountDue,
						refundableDeposit: quote.refundableDeposit,
						paidAt: startDate,
						...(copy ? { copyId: copy.id } : {}),
						loanRequestId: loanRequest?.id,
						status: "ACTIVE",
					},
					include: { book: { select: { id: true, title: true, author: true, coverUrl: true } } },
				});
				createdRentals.push(rental);
				if (copy) {
					await recordInventoryMovement(tx, { bookId: book.id, copyId: copy.id, actorId: session.userId, type: "LOAN", quantity: -1 });
					await refreshBookInventory(tx, book.id);
				}
				await writeAuditLog(tx, {
					actorId: session.userId,
					action: "loan.created",
					entity: "rental",
					entityId: rental.id,
					metadata: { rentalMode, rentalFee: quote.rentalFee, amountPaid: quote.amountDue, refundableDeposit: quote.refundableDeposit },
				});
			}
			return createdRentals;
		});
		return NextResponse.json({ data: rentals }, { status: 201 });
	} catch (error) {
		if (
			idempotencyKey &&
			((error instanceof Error && error.message === "BOOK_UNAVAILABLE") ||
				(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"))
		) {
			const previous = await prisma.loanRequest.findUnique({
				where: { userId_idempotencyKey: { userId: session.userId, idempotencyKey } },
				include: { rentals: { include: { book: { select: { id: true, title: true, author: true, coverUrl: true } } }, orderBy: { bookId: "asc" } } },
			});
			if (previous?.requestHash === requestHash && previous.rentals.length === items.length) {
				return NextResponse.json({ data: previous.rentals });
			}
			if (previous) return NextResponse.json({ message: "Idempotency-Key đã được dùng cho yêu cầu khác" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "BOOK_NOT_FOUND") {
			return NextResponse.json({ message: "Không tìm thấy sách" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "BOOK_UNAVAILABLE") {
			return NextResponse.json({ message: "Sách hiện không còn bản để cho mượn" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "BOOK_PRICE_UNAVAILABLE") {
			return NextResponse.json({ message: "Sách chưa được cấu hình giá bán để tính giá thuê và khoản cọc" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "DIGITAL_CONTENT_UNAVAILABLE") {
			return NextResponse.json({ message: "Sách chưa có ebook hợp lệ để thuê online" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "BOOK_HAS_WAITING_RESERVATIONS") {
			return NextResponse.json({ message: "Có độc giả đang chờ sách này. Vui lòng đặt trước để giữ đúng thứ tự hàng đợi." }, { status: 409 });
		}
		return internalApiError(request, error, "Không thể tạo phiếu mượn lúc này");
	}
}
