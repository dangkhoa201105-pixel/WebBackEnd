import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { expireReadyReservations } from "@/lib/library";
import { prisma } from "@/lib/prisma";
import { internalApiError } from "@/lib/http";
import { createReservation } from "@/lib/services/reservation-service";
import { z } from "zod";

const schema = z.object({ bookId: z.string().min(1) });

export async function GET(request: Request) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	const url = new URL(request.url);
	const staff = session.role === "ADMIN" || session.role === "LIBRARIAN";
	const userId = staff ? url.searchParams.get("userId") : session.userId;
	await prisma.$transaction((tx) => expireReadyReservations(tx));
	const reservations = await prisma.reservation.findMany({
		where: { ...(userId ? { userId } : {}), ...(url.searchParams.get("active") === "true" ? { status: { in: ["WAITING", "READY"] } } : {}) },
		include: {
			book: { select: { id: true, title: true, author: true, coverUrl: true, salePrice: true } },
			copy: { select: { id: true, barcode: true } },
			user: { select: { id: true, name: true, email: true } },
		},
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		take: 100,
	});
	const queuePositions = await Promise.all(reservations.map(async (reservation) => reservation.status === "WAITING"
		? prisma.reservation.count({
			where: {
				bookId: reservation.bookId,
				status: "WAITING",
				OR: [
					{ createdAt: { lt: reservation.createdAt } },
					{ createdAt: reservation.createdAt, id: { lte: reservation.id } },
				],
			},
		})
		: 0));
	return NextResponse.json(reservations.map((reservation, index) => ({ ...reservation, queuePosition: queuePositions[index] })));
}

export async function POST(request: Request) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Dữ liệu đặt trước không hợp lệ" }, { status: 400 });
	}
	const input = schema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Mã sách không hợp lệ" }, { status: 400 });

	try {
		const reservation = await prisma.$transaction((tx) => createReservation(tx, {
			userId: session.userId,
			bookId: input.data.bookId,
		}));
		return NextResponse.json(reservation, { status: 201 });
	} catch (error) {
		if (error instanceof Error && error.message === "BOOK_NOT_FOUND") {
			return NextResponse.json({ message: "Không tìm thấy sách" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "ALREADY_BORROWED") {
			return NextResponse.json({ message: "Bạn đang mượn đầu sách này" }, { status: 409 });
		}
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
			return NextResponse.json({ message: "Bạn đã có yêu cầu đặt trước đang chờ hoặc sẵn sàng" }, { status: 409 });
		}
		return internalApiError(request, error, "Không thể tạo yêu cầu đặt trước lúc này");
	}
}
