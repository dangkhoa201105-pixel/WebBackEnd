import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { parseCatalogQuery } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
	const params = request.nextUrl.searchParams;
	const parsed = parseCatalogQuery(params);
	if (!parsed.success) {
		return NextResponse.json({ message: "Bộ lọc danh mục không hợp lệ", issues: parsed.error.flatten() }, { status: 400 });
	}
	const query = parsed.data.q;
	const category = parsed.data.category;
	const where: Prisma.BookWhereInput = {
		...(query ? { OR: [
			{ title: { contains: query, mode: "insensitive" as const } },
			{ author: { contains: query, mode: "insensitive" as const } },
		] } : {}),
		...(category && category !== "Tất cả" ? { category: { name: category } } : {}),
		...(parsed.data.availableOnly === "true" ? { available: { gt: 0 } } : {}),
		...(parsed.data.minPrice !== undefined || parsed.data.maxPrice !== undefined ? {
			pricePerDay: {
				...(parsed.data.minPrice !== undefined ? { gte: parsed.data.minPrice } : {}),
				...(parsed.data.maxPrice !== undefined ? { lte: parsed.data.maxPrice } : {}),
			},
		} : {}),
	};
	const orderByBySort: Record<typeof parsed.data.sort, Prisma.BookOrderByWithRelationInput[]> = {
		featured: [{ featured: "desc" }, { createdAt: "desc" }],
		newest: [{ createdAt: "desc" }],
		price_asc: [{ pricePerDay: "asc" }, { title: "asc" }],
		price_desc: [{ pricePerDay: "desc" }, { title: "asc" }],
		title: [{ title: "asc" }],
	};
	const orderBy = orderByBySort[parsed.data.sort];

	const [data, total] = await Promise.all([
		prisma.book.findMany({
			where,
			select: {
				id: true,
				title: true,
				slug: true,
				author: true,
				description: true,
				coverUrl: true,
				featured: true,
				pricePerDay: true,
				stock: true,
				available: true,
				salePrice: true,
				saleStock: true,
				hasDigitalContent: true,
				category: { select: { id: true, name: true, slug: true } },
			},
			orderBy,
			skip: (parsed.data.page - 1) * parsed.data.limit,
			take: parsed.data.limit,
		}),
		prisma.book.count({ where }),
	]);
	return NextResponse.json({
		data,
		meta: {
			page: parsed.data.page,
			limit: parsed.data.limit,
			total,
			pageCount: Math.ceil(total / parsed.data.limit),
			filters: {
				q: query,
				category: category || null,
				minPrice: parsed.data.minPrice ?? null,
				maxPrice: parsed.data.maxPrice ?? null,
				availableOnly: parsed.data.availableOnly === "true",
				sort: parsed.data.sort,
			},
		},
	});
}
