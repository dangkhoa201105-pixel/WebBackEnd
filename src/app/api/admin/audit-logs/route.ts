import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
	if (!await requireAdmin()) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	const url = new URL(request.url);
	const requestedPage = Number(url.searchParams.get("page") ?? 1);
	const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
	const page = Number.isFinite(requestedPage) ? Math.max(Math.floor(requestedPage), 1) : 1;
	const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100) : 50;
	const action = url.searchParams.get("action")?.trim().slice(0, 100);
	const entity = url.searchParams.get("entity")?.trim().slice(0, 80);
	const where = {
		...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
		...(entity ? { entity } : {}),
	};
	const [data, total] = await Promise.all([
		prisma.auditLog.findMany({
			where,
			include: { actor: { select: { id: true, name: true, email: true } } },
			orderBy: { createdAt: "desc" },
			skip: (page - 1) * limit,
			take: limit,
		}),
		prisma.auditLog.count({ where }),
	]);
	return NextResponse.json({ data, meta: { page, limit, total } });
}
