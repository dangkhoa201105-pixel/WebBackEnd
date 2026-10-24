import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
		? requestedUserId ? { rental: { userId: requestedUserId } } : {}
		: { rental: { userId: session.userId } };
	const fines = await prisma.fine.findMany({
		where,
		include: {
			rental: { select: { id: true, dueDate: true, returnedAt: true, book: { select: { id: true, title: true } } } },
		},
		orderBy: { createdAt: "desc" },
		skip: (page - 1) * limit,
		take: limit,
	});
	const total = await prisma.fine.count({ where });
	return NextResponse.json({ data: fines, meta: { page, limit, total } });
}
