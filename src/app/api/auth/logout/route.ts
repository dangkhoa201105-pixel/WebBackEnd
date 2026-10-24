import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function POST() {
	const session = await getSession();
	if (session) {
		await prisma.$transaction(async (tx) => {
			await tx.loginSession.updateMany({
				where: { id: session.sessionId, userId: session.userId, revokedAt: null },
				data: { revokedAt: new Date() },
			});
			await writeAuditLog(tx, { actorId: session.userId, action: "auth.logout", entity: "user", entityId: session.userId });
		});
	}
  const response = NextResponse.json({ ok: true });
  response.cookies.set("booknest_token", "", {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		expires: new Date(0),
		path: "/",
	});
  return response;
}