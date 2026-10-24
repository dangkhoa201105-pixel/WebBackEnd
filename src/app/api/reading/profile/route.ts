import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
	monthlyReadingGoal: z.coerce.number().int().min(1).max(100),
	preferredCategories: z.array(z.string().min(1)).max(5),
}).refine((value) => new Set(value.preferredCategories).size === value.preferredCategories.length);

export async function GET() {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	const [profile, categories] = await Promise.all([
		prisma.readingProfile.upsert({
			where: { userId: session.userId },
			create: { userId: session.userId },
			update: {},
		}),
		prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
	]);
	return NextResponse.json({ profile, categories });
}

export async function PATCH(request: Request) {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Thông tin mục tiêu đọc không hợp lệ" }, { status: 400 });
	}
	const input = schema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Mục tiêu phải từ 1 đến 100 sách/tháng và chọn tối đa 5 thể loại" }, { status: 400 });
	const validCategories = await prisma.category.count({ where: { id: { in: input.data.preferredCategories } } });
	if (validCategories !== input.data.preferredCategories.length) {
		return NextResponse.json({ message: "Một hoặc nhiều thể loại không tồn tại" }, { status: 400 });
	}
	const profile = await prisma.readingProfile.upsert({
		where: { userId: session.userId },
		create: { userId: session.userId, ...input.data },
		update: input.data,
	});
	return NextResponse.json(profile);
}
