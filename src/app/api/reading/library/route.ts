import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bookSelection = { id: true, title: true, author: true, coverUrl: true, hasDigitalContent: true } as const;

export async function GET() {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });

	const now = new Date();
	const [rentals, orders] = await Promise.all([
		prisma.rental.findMany({
			where: { userId: session.userId, rentalMode: "ONLINE", status: "ACTIVE", returnedAt: null, dueDate: { gt: now } },
			select: { id: true, dueDate: true, book: { select: bookSelection } },
			orderBy: { dueDate: "asc" },
		}),
		prisma.order.findMany({
			where: {
				userId: session.userId,
				status: "CONFIRMED",
				paymentStatus: "PAID",
			},
			select: {
				createdAt: true,
				items: { select: { book: { select: bookSelection } } },
			},
			orderBy: { createdAt: "desc" },
		}),
	]);

	const books = new Map<string, {
		id: string;
		title: string;
		author: string;
		coverUrl: string | null;
		hasDigitalContent: boolean;
		accessType: "PURCHASE" | "RENTAL";
		expiresAt: string | null;
	}>();

	for (const rental of rentals) {
		books.set(rental.book.id, {
			...rental.book,
			accessType: "RENTAL",
			expiresAt: rental.dueDate.toISOString(),
		});
	}
	for (const order of orders) {
		for (const item of order.items) {
			books.set(item.book.id, {
				...item.book,
				accessType: "PURCHASE",
				expiresAt: null,
			});
		}
	}

	return NextResponse.json(
		{ data: [...books.values()] },
		{ headers: { "Cache-Control": "private, no-store" } },
	);
}
