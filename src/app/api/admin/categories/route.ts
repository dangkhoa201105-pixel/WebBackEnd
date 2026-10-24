import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const schema = z.object({ name: z.string().trim().min(2).max(80) });
const slugify = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function GET() {
	if (!await requireAdmin()) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	return NextResponse.json(await prisma.category.findMany({ orderBy: { name: "asc" } }));
}

export async function POST(request: Request) {
	const session = await requireAdmin();
	if (!session) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Tên danh mục không hợp lệ" }, { status: 400 });
	}
	const input = schema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Tên danh mục phải có từ 2 đến 80 ký tự" }, { status: 400 });
	try {
		const category = await prisma.$transaction(async (tx) => {
			const created = await tx.category.create({ data: { name: input.data.name, slug: slugify(input.data.name) } });
			await writeAuditLog(tx, { actorId: session.userId, action: "category.created", entity: "category", entityId: created.id });
			return created;
		});
		return NextResponse.json(category, { status: 201 });
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
			return NextResponse.json({ message: "Danh mục hoặc slug đã tồn tại" }, { status: 409 });
		}
		throw error;
	}
}
