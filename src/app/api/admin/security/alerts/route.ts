import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
	if (!await requireAdmin()) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	const url = new URL(request.url);
	const status = z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).safeParse(url.searchParams.get("status"));
	const [data, counts, failedLogins, sensitiveChanges] = await Promise.all([
		prisma.securityAlert.findMany({
			where: status.success ? { status: status.data } : {},
			include: { user: { select: { id: true, name: true, email: true } } },
			orderBy: [{ createdAt: "desc" }],
			take: 100,
		}),
		prisma.securityAlert.groupBy({ by: ["status"], _count: { id: true } }),
		prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
		prisma.auditLog.findMany({
			where: {
				createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
				action: { in: ["user.role_changed", "user.status_locked", "book.price_changed", "inventory.copy_status_changed"] },
			},
			include: { actor: { select: { name: true, email: true } } },
			orderBy: { createdAt: "desc" },
			take: 50,
		}),
	]);
	return NextResponse.json({ data, counts, failedLoginsLast24Hours: failedLogins, sensitiveChanges });
}

const schema = z.object({ id: z.string().min(1), status: z.enum(["ACKNOWLEDGED", "RESOLVED"]) });

export async function PATCH(request: Request) {
	if (!await requireAdmin()) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Dữ liệu cảnh báo không hợp lệ" }, { status: 400 });
	}
	const input = schema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Trạng thái cảnh báo không hợp lệ" }, { status: 400 });
	const result = await prisma.securityAlert.updateMany({
		where: { id: input.data.id },
		data: { status: input.data.status },
	});
	if (result.count !== 1) return NextResponse.json({ message: "Không tìm thấy cảnh báo" }, { status: 404 });
	return NextResponse.json({ ok: true, status: input.data.status });
}
