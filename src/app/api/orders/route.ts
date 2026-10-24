import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordInventoryMovement } from "@/lib/library";
import { getPayosConfiguration, PayosConfigurationError } from "@/lib/payos";
import { createPayosCheckout, createPayosOrderCode, isKnownPayosOrderError } from "@/lib/payos-orders";
import { prisma } from "@/lib/prisma";
import { internalApiError } from "@/lib/http";

const schema = z.object({
	items: z.array(z.object({ bookId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(10) })).min(1).max(30),
	paymentMethod: z.enum(["CASH", "SIMULATED", "PAYOS"]),
});

async function respondWithOrder(request: Request, order: Prisma.OrderGetPayload<{ include: { items: true } }>, status = 200) {
	if (order.paymentMethod !== "PAYOS" || order.status !== "CONFIRMED" || order.paymentStatus !== "PENDING") {
		return NextResponse.json(order, { status });
	}
	try {
		const checkoutUrl = await createPayosCheckout(order);
		return NextResponse.json({ ...order, checkoutUrl }, { status });
	} catch (error) {
		if (!isKnownPayosOrderError(error)) internalApiError(request, error, "Không thể tạo link PayOS");
		return NextResponse.json({
			message: isKnownPayosOrderError(error) ? "Đơn PayOS không còn đủ điều kiện thanh toán" : "Chưa tạo được link PayOS; bạn có thể thử lại từ lịch sử đơn hàng",
			orderId: order.id,
		}, { status: isKnownPayosOrderError(error) ? 409 : 502 });
	}
}

export async function GET(request: Request) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	const url = new URL(request.url);
	const requestedPage = Number(url.searchParams.get("page") ?? 1);
	const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
	const page = Number.isFinite(requestedPage) ? Math.max(Math.floor(requestedPage), 1) : 1;
	const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 50) : 20;
	const staff = session.role === "ADMIN" || session.role === "LIBRARIAN";
	const requestedUserId = url.searchParams.get("userId");
	const where = staff
		? requestedUserId ? { userId: requestedUserId } : {}
		: { userId: session.userId };

	const [data, total] = await Promise.all([
		prisma.order.findMany({
			where,
			include: { items: true, user: { select: { id: true, name: true, email: true } } },
			orderBy: { createdAt: "desc" },
			skip: (page - 1) * limit,
			take: limit,
		}),
		prisma.order.count({ where }),
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
		return NextResponse.json({ message: "Dữ liệu đặt hàng không hợp lệ" }, { status: 400 });
	}
	const input = schema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Danh sách sách hoặc phương thức thanh toán không hợp lệ" }, { status: 400 });
	let payosConfiguration: ReturnType<typeof getPayosConfiguration> | null = null;
	if (input.data.paymentMethod === "PAYOS") {
		try {
			payosConfiguration = getPayosConfiguration();
		} catch (error) {
			if (error instanceof PayosConfigurationError) {
				return NextResponse.json({ message: "Thanh toán PayOS đang tắt hoặc chưa được cấu hình đầy đủ" }, { status: 503 });
			}
			return internalApiError(request, error, "Không thể khởi tạo thanh toán PayOS");
		}
	}

	const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? null;
	if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 128)) {
		return NextResponse.json({ message: "Idempotency-Key phải có độ dài từ 8 đến 128 ký tự" }, { status: 400 });
	}
	const quantities = new Map<string, number>();
	for (const item of input.data.items) {
		const quantity = (quantities.get(item.bookId) ?? 0) + item.quantity;
		if (quantity > 10) return NextResponse.json({ message: "Mỗi đầu sách chỉ được đặt tối đa 10 cuốn" }, { status: 400 });
		quantities.set(item.bookId, quantity);
	}
	const requestHash = createHash("sha256")
		.update(JSON.stringify({
			items: [...quantities.entries()].sort(([a], [b]) => a.localeCompare(b)),
			paymentMethod: input.data.paymentMethod,
		}))
		.digest("hex");
	if (idempotencyKey) {
		const previous = await prisma.order.findUnique({ where: { idempotencyKey }, include: { items: true } });
		if (previous) {
			if (previous.userId !== session.userId || previous.requestHash !== requestHash) {
				return NextResponse.json({ message: "Idempotency-Key đã được dùng cho yêu cầu khác" }, { status: 409 });
			}
			return respondWithOrder(request, previous);
		}
	}

	try {
		const order = await prisma.$transaction(async (tx) => {
			const books = await tx.book.findMany({ where: { id: { in: [...quantities.keys()] } } });
			if (books.length !== quantities.size) throw new Error("BOOK_NOT_FOUND");
			const items = books.map((book) => {
				const quantity = quantities.get(book.id) ?? 0;
				if (book.salePrice <= 0) throw new Error("BOOK_NOT_FOR_SALE");
				if (book.saleStock < quantity) throw new Error("SALE_STOCK_UNAVAILABLE");
				if (book.salePrice > 100_000_000) throw new Error("INVALID_BOOK_PRICE");
				return { book, quantity, subtotal: book.salePrice * quantity };
			});
			const total = items.reduce((sum, item) => sum + item.subtotal, 0);
			if (!Number.isSafeInteger(total) || total > 2_000_000_000) throw new Error("ORDER_TOTAL_TOO_LARGE");
			if (payosConfiguration && total > payosConfiguration.maxAmount) throw new Error("PAYMENT_AMOUNT_OVER_LIMIT");

			for (const item of items) {
				const reserved = await tx.book.updateMany({
					where: { id: item.book.id, saleStock: { gte: item.quantity } },
					data: { saleStock: { decrement: item.quantity } },
				});
				if (reserved.count !== 1) throw new Error("SALE_STOCK_UNAVAILABLE");
				await recordInventoryMovement(tx, {
					bookId: item.book.id,
					actorId: session.userId,
					type: "BOOK_SALE",
					quantity: -item.quantity,
					notes: "Xuất kho bán sách",
				});
			}

			const created = await tx.order.create({
				data: {
					userId: session.userId,
					paymentMethod: input.data.paymentMethod,
					paymentStatus: input.data.paymentMethod === "SIMULATED" ? "PAID" : "PENDING",
					total,
					...(input.data.paymentMethod === "PAYOS" ? {
						paymentOrderCode: createPayosOrderCode(),
						paymentExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
					} : {}),
					idempotencyKey,
					requestHash,
					items: {
						create: items.map(({ book, quantity, subtotal }) => ({
							bookId: book.id,
							title: book.title,
							unitPrice: book.salePrice,
							quantity,
							subtotal,
						})),
					},
				},
				include: { items: true },
			});
			await writeAuditLog(tx, {
				actorId: session.userId,
				action: "order.created",
				entity: "order",
				entityId: created.id,
				metadata: { total: created.total, paymentMethod: created.paymentMethod },
			});
			return created;
		});
		return respondWithOrder(request, order, 201);
	} catch (error) {
		if (
			idempotencyKey &&
			((error instanceof Error && error.message === "SALE_STOCK_UNAVAILABLE") ||
				(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"))
		) {
			const previous = await prisma.order.findUnique({ where: { idempotencyKey }, include: { items: true } });
			if (previous?.userId === session.userId && previous.requestHash === requestHash) {
				return NextResponse.json(previous);
			}
			if (previous) return NextResponse.json({ message: "Idempotency-Key đã được dùng cho yêu cầu khác" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "BOOK_NOT_FOUND") {
			return NextResponse.json({ message: "Một hoặc nhiều sách không tồn tại" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "BOOK_NOT_FOR_SALE") {
			return NextResponse.json({ message: "Một hoặc nhiều sách hiện không được bán" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "SALE_STOCK_UNAVAILABLE") {
			return NextResponse.json({ message: "Số lượng sách bán không đủ" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "INVALID_BOOK_PRICE") {
			return NextResponse.json({ message: "Giá bán sách chưa hợp lệ" }, { status: 409 });
		}
		if (error instanceof Error && error.message === "ORDER_TOTAL_TOO_LARGE") {
			return NextResponse.json({ message: "Tổng giá trị đơn hàng vượt giới hạn" }, { status: 400 });
		}
		if (error instanceof Error && error.message === "PAYMENT_AMOUNT_OVER_LIMIT") {
			return NextResponse.json({ message: "Đơn hàng vượt giới hạn thanh toán PayOS đã cấu hình" }, { status: 400 });
		}
		return internalApiError(request, error, "Không thể tạo đơn hàng lúc này");
	}
}
