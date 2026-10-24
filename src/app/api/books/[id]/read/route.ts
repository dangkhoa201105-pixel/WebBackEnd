import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveRentalReadingAccess, hasPermanentPurchaseReadingAccess } from "@/lib/reading-access";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });

	const { id } = await context.params;
	const now = new Date();
	const [book, rental, purchase] = await Promise.all([
		prisma.book.findUnique({
			where: { id },
			select: { id: true, title: true, author: true, readerContent: true, hasDigitalContent: true },
		}),
		prisma.rental.findFirst({
			where: { userId: session.userId, bookId: id, rentalMode: "ONLINE", status: "ACTIVE", returnedAt: null, dueDate: { gt: now } },
			select: { rentalMode: true, status: true, returnedAt: true, dueDate: true },
			orderBy: { dueDate: "desc" },
		}),
		prisma.order.findFirst({
			where: {
				userId: session.userId,
				status: "CONFIRMED",
				paymentStatus: "PAID",
				items: { some: { bookId: id } },
			},
			select: { status: true, paymentStatus: true },
		}),
	]);

	if (!book) return NextResponse.json({ message: "Không tìm thấy sách" }, { status: 404 });
	const hasRentalAccess = hasActiveRentalReadingAccess(rental, now);
	const hasPurchaseAccess = hasPermanentPurchaseReadingAccess(purchase);
	if (!hasRentalAccess && !hasPurchaseAccess) {
		return NextResponse.json({ message: "Bạn cần có phiếu mượn còn hạn hoặc đã mua sách để đọc online" }, { status: 403 });
	}
	if (!book.hasDigitalContent || !book.readerContent?.trim()) {
		return NextResponse.json({ message: "Nội dung ebook chưa được bổ sung. Vui lòng thử lại sau." }, { status: 409 });
	}

	return NextResponse.json(
		{
			book: { id: book.id, title: book.title, author: book.author },
			content: book.readerContent,
			accessType: hasPurchaseAccess ? "PURCHASE" : "RENTAL",
			expiresAt: hasPurchaseAccess ? null : rental?.dueDate.toISOString() ?? null,
		},
		{ headers: { "Cache-Control": "private, no-store" } },
	);
}
