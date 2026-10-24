import { NextResponse } from "next/server";
import { InventoryMovementType, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
	if (!await requireStaff()) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	const url = new URL(request.url);
	const pageValue = Number(url.searchParams.get("page") ?? 1);
	const pageSizeValue = Number(url.searchParams.get("limit") ?? 50);
	const page = Number.isFinite(pageValue) ? Math.max(1, Math.floor(pageValue)) : 1;
	const limit = Number.isFinite(pageSizeValue) ? Math.min(100, Math.max(1, Math.floor(pageSizeValue))) : 50;
	const bookId = url.searchParams.get("bookId");
	const movementType = z.nativeEnum(InventoryMovementType).safeParse(url.searchParams.get("type"));
	const where: Prisma.InventoryMovementWhereInput = {
		...(bookId ? { bookId } : {}),
		...(movementType.success ? { type: movementType.data } : {}),
	};
	const [data, total] = await Promise.all([
		prisma.inventoryMovement.findMany({
			where,
			include: {
				book: { select: { id: true, title: true } },
				copy: { select: { id: true, barcode: true } },
				actor: { select: { id: true, name: true } },
			},
			orderBy: { createdAt: "desc" },
			skip: (page - 1) * limit,
			take: limit,
		}),
		prisma.inventoryMovement.count({ where }),
	]);
	return NextResponse.json({ data, meta: { page, limit, total } });
}
