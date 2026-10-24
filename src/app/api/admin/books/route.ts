import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordInventoryMovement, refreshBookInventory } from "@/lib/library";

const bookSchema = z.object({
	title: z.string().trim().min(1).max(200),
	author: z.string().trim().min(1).max(160),
	description: z.string().trim().min(1).max(5000),
	readerContent: z.string().max(500_000).default(""),
	coverUrl: z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)).optional().or(z.literal("")),
	pricePerDay: z.coerce.number().int().positive().max(50_000_000),
	stock: z.coerce.number().int().nonnegative().max(1_000),
	salePrice: z.coerce.number().int().nonnegative().max(100_000_000).default(0),
	saleStock: z.coerce.number().int().nonnegative().max(100_000),
	categoryId: z.string().min(1),
	featured: z.boolean().default(false),
});
const slugify = (text: string) => `${text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

export async function GET() {
	if (!await requireAdmin()) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	return NextResponse.json(await prisma.book.findMany({
		select: {
			id: true,
			title: true,
			author: true,
			pricePerDay: true,
			stock: true,
			featured: true,
			hasDigitalContent: true,
			category: { select: { name: true } },
		},
		orderBy: { createdAt: "desc" },
	}));
}

export async function POST(request: Request) {
	const session = await requireAdmin();
	if (!session) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Dữ liệu sách không hợp lệ" }, { status: 400 });
	}
	const input = bookSchema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Dữ liệu sách không hợp lệ", issues: input.error.flatten() }, { status: 400 });
	try {
		const book = await prisma.$transaction(async (tx) => {
			const created = await tx.book.create({
				data: {
					...input.data,
					readerContent: input.data.readerContent || null,
					hasDigitalContent: Boolean(input.data.readerContent.trim()),
					stock: 0,
					available: 0,
					slug: slugify(input.data.title),
					coverUrl: input.data.coverUrl || null,
				},
			});
			for (let index = 0; index < input.data.stock; index++) {
				await tx.bookCopy.create({
					data: {
						bookId: created.id,
						barcode: `BN-${randomUUID()}`,
					},
				});
			}
			await refreshBookInventory(tx, created.id);
			if (input.data.stock > 0) {
				await recordInventoryMovement(tx, {
					bookId: created.id,
					actorId: session.userId,
					type: "INTAKE",
					quantity: input.data.stock,
					notes: "Nhập bản sách khi tạo đầu sách",
				});
			}
			await writeAuditLog(tx, { actorId: session.userId, action: "book.created", entity: "book", entityId: created.id });
			return tx.book.findUniqueOrThrow({ where: { id: created.id }, include: { category: true } });
		});
		return NextResponse.json(book, { status: 201 });
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
			return NextResponse.json({ message: "Danh mục sách không tồn tại" }, { status: 400 });
		}
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
			return NextResponse.json({ message: "Không thể tạo sách do trùng định danh" }, { status: 409 });
		}
		console.error("Book creation failed:", error);
		return NextResponse.json({ message: "Không thể lưu sách" }, { status: 500 });
	}
}
