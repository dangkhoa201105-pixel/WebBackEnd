import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, context: Context) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	const { id } = await context.params;
	const result = await prisma.$transaction(async (tx) => {
		const revoked = await tx.loginSession.updateMany({
			where: { id, userId: session.userId, revokedAt: null },
			data: { revokedAt: new Date() },
		});
		if (revoked.count !== 1) return false;
		await writeAuditLog(tx, {
			actorId: session.userId,
			action: "auth.session_revoked",
			entity: "login_session",
			entityId: id,
		});
		return true;
	});
	if (!result) return NextResponse.json({ message: "Không tìm thấy phiên đang hoạt động" }, { status: 404 });
	return NextResponse.json({ ok: true, current: id === session.sessionId });
}
