import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDueLoanNotifications } from "@/lib/scheduled-jobs";

export async function GET() {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	const now = new Date();
	await prisma.$transaction((tx) => createDueLoanNotifications(tx, now, session.userId));
	const [data, unread] = await Promise.all([
		prisma.notification.findMany({
			where: { userId: session.userId },
			orderBy: { createdAt: "desc" },
			take: 50,
		}),
		prisma.notification.count({ where: { userId: session.userId, readAt: null } }),
	]);
	return NextResponse.json({ data, unread });
}
