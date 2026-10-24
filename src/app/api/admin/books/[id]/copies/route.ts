import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordInventoryMovement, refreshBookInventory } from "@/lib/library";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };
const schema = z.object({ count: z.coerce.number().int().min(1).max(100), notes: z.string().trim().max(500).optional() });

export async function GET(_: Request, context: Context) {
	if (!await requireStaff()) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	const { id } = await context.params;
	const copies = await prisma.bookCopy.findMany({
		where: { bookId: id },
		include: { rentals: { where: { status: "ACTIVE" }, select: { id: true, user: { select: { id: true, name: true, email: true } }, dueDate: true } } },
		orderBy: [{ status: "asc" }, { acquiredAt: "asc" }],
	});
	return NextResponse.json(copies);
}

export async function POST(request: Request, context: Context) {
	const session = await requireStaff();
	if (!session) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Dữ liệu nhập kho không hợp lệ" }, { status: 400 });
	}
	const input = schema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Số lượng phải từ 1 đến 100 và ghi chú tối đa 500 ký tự" }, { status: 400 });
	const { id } = await context.params;

	const result = await prisma.$transaction(async (tx) => {
		const book = await tx.book.findUnique({ where: { id }, select: { id: true } });
		if (!book) return null;
		const copies = [];
		for (let index = 0; index < input.data.count; index++) {
			copies.push(await tx.bookCopy.create({ data: { bookId: id, barcode: `BN-${randomUUID()}`, notes: input.data.notes } }));
		}
		await recordInventoryMovement(tx, {
			bookId: id,
			actorId: session.userId,
			type: "INTAKE",
			quantity: input.data.count,
			notes: input.data.notes ?? "Nhập bản sách",
		});
		await refreshBookInventory(tx, id);
		await writeAuditLog(tx, {
			actorId: session.userId,
			action: "inventory.copies_received",
			entity: "book",
			entityId: id,
			metadata: { count: input.data.count },
		});
		return copies;
	});
	if (!result) return NextResponse.json({ message: "Không tìm thấy sách" }, { status: 404 });
	return NextResponse.json(result, { status: 201 });
}
