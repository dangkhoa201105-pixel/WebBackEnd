import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordInventoryMovement, refreshBookInventory } from "@/lib/library";
import { createSecurityAlert } from "@/lib/security";

const schema = z.object({
	title: z.string().trim().min(1).max(200),
	author: z.string().trim().min(1).max(160),
	description: z.string().trim().min(1).max(5000),
	readerContent: z.string().max(500_000).optional(),
	coverUrl: z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)).optional().or(z.literal("")),
	pricePerDay: z.coerce.number().int().positive().max(50_000_000),
	stock: z.coerce.number().int().nonnegative().max(1_000),
	salePrice: z.coerce.number().int().nonnegative().max(100_000_000).default(0),
	saleStock: z.coerce.number().int().nonnegative().max(100_000),
	categoryId: z.string().min(1),
	featured: z.boolean(),
});
type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
	if (!await requireAdmin()) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	const book = await prisma.book.findUnique({ where: { id: (await context.params).id }, include: { category: true } });
	if (!book) return NextResponse.json({ message: "Không tìm thấy sách" }, { status: 404 });
	return NextResponse.json({ ...book, readerContent: book.readerContent ?? "" });
}

export async function PATCH(request: Request, context: Context) {
	const session = await requireAdmin();
	if (!session) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Dữ liệu sách không hợp lệ" }, { status: 400 });
	}
	const input = schema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ", issues: input.error.flatten() }, { status: 400 });
	const { id } = await context.params;
	try {
		const book = await prisma.$transaction(async (tx) => {
			const current = await tx.book.findUnique({ where: { id } });
			if (!current) throw new Error("BOOK_NOT_FOUND");
			const copyCount = await tx.bookCopy.count({ where: { bookId: id, status: { notIn: ["LOST", "DISPOSED"] } } });
			if (input.data.stock < copyCount) {
				const reduction = copyCount - input.data.stock;
				const removable = await tx.bookCopy.findMany({
					where: { bookId: id, status: "AVAILABLE" },
					orderBy: { createdAt: "desc" },
					take: reduction,
					select: { id: true },
				});
				if (removable.length !== reduction) throw new Error("STOCK_BELOW_UNAVAILABLE_COPIES");
				for (const copy of removable) {
					await tx.bookCopy.update({ where: { id: copy.id }, data: { status: "DISPOSED" } });
					await recordInventoryMovement(tx, {
						bookId: id,
						copyId: copy.id,
						actorId: session.userId,
						type: "DISPOSED",
						quantity: -1,
						notes: "Thanh lý bản sách khi điều chỉnh tồn kho",
					});
				}
			} else if (input.data.stock > copyCount) {
				const increase = input.data.stock - copyCount;
				for (let index = 0; index < increase; index++) {
					await tx.bookCopy.create({ data: { bookId: id, barcode: `BN-${randomUUID()}` } });
				}
				await recordInventoryMovement(tx, {
					bookId: id,
					actorId: session.userId,
					type: "INTAKE",
					quantity: increase,
					notes: "Nhập thêm bản sách khi điều chỉnh tồn kho",
				});
			}
			const updated = await tx.book.update({
				where: { id },
				data: {
					title: input.data.title,
					author: input.data.author,
					description: input.data.description,
					...(input.data.readerContent !== undefined ? {
						readerContent: input.data.readerContent || null,
						hasDigitalContent: Boolean(input.data.readerContent.trim()),
					} : {}),
					pricePerDay: input.data.pricePerDay,
					salePrice: input.data.salePrice,
					saleStock: input.data.saleStock,
					categoryId: input.data.categoryId,
					featured: input.data.featured,
					coverUrl: input.data.coverUrl || null,
				},
			});
			await refreshBookInventory(tx, id);
			await writeAuditLog(tx, { actorId: session.userId, action: "book.updated", entity: "book", entityId: id });
			if (current.pricePerDay !== input.data.pricePerDay || current.salePrice !== input.data.salePrice) {
				await writeAuditLog(tx, {
					actorId: session.userId,
					action: "book.price_changed",
					entity: "book",
					entityId: id,
					metadata: {
						rentalPriceBefore: current.pricePerDay,
						rentalPriceAfter: input.data.pricePerDay,
						salePriceBefore: current.salePrice,
						salePriceAfter: input.data.salePrice,
					},
				});
				await createSecurityAlert(tx, {
					type: "BOOK_PRICE_CHANGED",
					severity: "MEDIUM",
					description: "A book rental or sale price was changed by an administrator.",
					metadata: { actorId: session.userId, bookId: id },
				});
			}
			if (input.data.readerContent !== undefined && current.readerContent !== (input.data.readerContent || null)) {
				await writeAuditLog(tx, {
					actorId: session.userId,
					action: "book.digital_content_changed",
					entity: "book",
					entityId: id,
					metadata: { hasDigitalContent: Boolean(input.data.readerContent.trim()) },
				});
			}
			return { ...updated, stock: input.data.stock };
		});
		return NextResponse.json(book);
	} catch (error) {
		if (error instanceof Error && error.message === "BOOK_NOT_FOUND") {
			return NextResponse.json({ message: "Không tìm thấy sách" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "STOCK_BELOW_UNAVAILABLE_COPIES") {
			return NextResponse.json({ message: "Không thể giảm tồn kho vì chưa đủ bản sẵn sàng; bản đang mượn, đặt trước hoặc bảo trì không thể bị thanh lý" }, { status: 409 });
		}
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
			return NextResponse.json({ message: "Danh mục sách không tồn tại" }, { status: 400 });
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
			await tx.book.delete({ where: { id } });
			await writeAuditLog(tx, { actorId: session.userId, action: "book.deleted", entity: "book", entityId: id });
		});
		return NextResponse.json({ ok: true });
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
			return NextResponse.json({ message: "Không tìm thấy sách" }, { status: 404 });
		}
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
			return NextResponse.json({ message: "Không thể xóa sách đã có bản lưu kho hoặc phát sinh giao dịch; hãy chuyển các bản sách sang thanh lý" }, { status: 409 });
		}
		throw error;
	}
}
