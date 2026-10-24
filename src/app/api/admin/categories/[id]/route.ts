import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const schema = z.object({ name: z.string().trim().min(2).max(80) });
const slugify = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
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
	const { id } = await context.params;
	try {
		const category = await prisma.$transaction(async (tx) => {
			const updated = await tx.category.update({
				where: { id },
				data: { name: input.data.name, slug: slugify(input.data.name) },
			});
			await writeAuditLog(tx, { actorId: session.userId, action: "category.updated", entity: "category", entityId: id });
			return updated;
		});
		return NextResponse.json(category);
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
			return NextResponse.json({ message: "Không tìm thấy danh mục" }, { status: 404 });
		}
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
			return NextResponse.json({ message: "Danh mục hoặc slug đã tồn tại" }, { status: 409 });
		}
		throw error;
	}
}

export async function DELETE(_: Request, context: Context) {
	const session = await requireAdmin();
	if (!session) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	const { id } = await context.params;
	try {
		await prisma.$transaction(async (tx) => {
			await tx.category.delete({ where: { id } });
			await writeAuditLog(tx, { actorId: session.userId, action: "category.deleted", entity: "category", entityId: id });
		});
		return NextResponse.json({ ok: true });
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
			return NextResponse.json({ message: "Không tìm thấy danh mục" }, { status: 404 });
		}
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
			return NextResponse.json({ message: "Không thể xóa danh mục đang có sách" }, { status: 409 });
		}
		throw error;
	}
}
