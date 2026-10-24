import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(_: Request, context: Context) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	const { id } = await context.params;
	const updated = await prisma.notification.updateMany({
		where: { id, userId: session.userId },
		data: { readAt: new Date() },
	});
	if (updated.count !== 1) return NextResponse.json({ message: "Không tìm thấy thông báo" }, { status: 404 });
	return NextResponse.json({ ok: true });
}
