import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	const sessions = await prisma.loginSession.findMany({
		where: { userId: session.userId, revokedAt: null, expiresAt: { gt: new Date() } },
		select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastSeenAt: true, expiresAt: true },
		orderBy: { lastSeenAt: "desc" },
	});
	return NextResponse.json({
		data: sessions.map((item) => ({ ...item, current: item.id === session.sessionId })),
	});
}
