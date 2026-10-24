import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
	if (!await requireAdmin()) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	const monthStart = new Date();
	monthStart.setDate(1);
	monthStart.setHours(0, 0, 0, 0);
	const [userCount, bookCount, activeLoans, monthlyOrders, monthlyRevenue, unpaidFines, lowStockBooks, activeReservations, damagedCopies, topBorrowed] = await Promise.all([
		prisma.user.count(),
		prisma.book.count(),
		prisma.rental.count({ where: { status: "ACTIVE" } }),
		prisma.order.count({ where: { createdAt: { gte: monthStart }, status: "CONFIRMED" } }),
		prisma.order.aggregate({ where: { createdAt: { gte: monthStart }, status: "CONFIRMED", paymentStatus: "PAID" }, _sum: { total: true } }),
		prisma.fine.aggregate({ where: { paidAt: null }, _sum: { amount: true } }),
		prisma.book.findMany({
			where: { available: { lte: 3 } },
			select: { id: true, title: true, stock: true, available: true, saleStock: true },
			orderBy: { available: "asc" },
			take: 10,
		}),
		prisma.reservation.count({ where: { status: { in: ["WAITING", "READY"] } } }),
		prisma.bookCopy.count({ where: { status: { in: ["DAMAGED", "MAINTENANCE"] } } }),
		prisma.rental.groupBy({ by: ["bookId"], _count: { bookId: true }, orderBy: { _count: { bookId: "desc" } }, take: 5 }),
	]);
	const topBookIds = topBorrowed.map(({ bookId }) => bookId);
	const topBooks = topBookIds.length ? await prisma.book.findMany({
		where: { id: { in: topBookIds } },
		select: { id: true, title: true },
	}) : [];
	return NextResponse.json({
		userCount,
		bookCount,
		activeLoans,
		monthlyOrders,
		monthlyRevenue: monthlyRevenue._sum.total ?? 0,
		unpaidFineTotal: unpaidFines._sum.amount ?? 0,
		activeReservations,
		damagedCopies,
		lowStockBooks,
		topBorrowedBooks: topBorrowed.map((item) => ({
			...topBooks.find((book) => book.id === item.bookId),
			loans: item._count.bookId,
		})),
	});
}
