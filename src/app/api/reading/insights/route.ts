import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
	const session = await getSession();
	if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
	const monthStart = new Date();
	monthStart.setDate(1);
	monthStart.setHours(0, 0, 0, 0);
	const [profile, monthLoans, totalLoans, activeLoans, categoryHistory, popularCounts, borrowedBookIds] = await Promise.all([
		prisma.readingProfile.upsert({ where: { userId: session.userId }, create: { userId: session.userId }, update: {} }),
		prisma.rental.count({ where: { userId: session.userId, createdAt: { gte: monthStart } } }),
		prisma.rental.count({ where: { userId: session.userId } }),
		prisma.rental.count({ where: { userId: session.userId, status: "ACTIVE" } }),
		prisma.rental.findMany({
			where: { userId: session.userId },
			select: { book: { select: { category: { select: { id: true, name: true } } } } },
		}),
		prisma.rental.groupBy({ by: ["bookId"], _count: { bookId: true }, orderBy: { _count: { bookId: "desc" } }, take: 20 }),
		prisma.rental.findMany({ where: { userId: session.userId }, select: { bookId: true } }),
	]);
	const categoryCounts = new Map<string, { name: string; count: number }>();
	for (const item of categoryHistory) {
		const category = item.book.category;
		const current = categoryCounts.get(category.id) ?? { name: category.name, count: 0 };
		current.count += 1;
		categoryCounts.set(category.id, current);
	}
	const preferredIds = new Set(profile.preferredCategories);
	const historyPreferred = [...categoryCounts.entries()]
		.sort((a, b) => b[1].count - a[1].count)
		.map(([id]) => id);
	const categoryIds = preferredIds.size ? [...preferredIds] : historyPreferred.slice(0, 3);
	const excludeIds = [...new Set(borrowedBookIds.map(({ bookId }) => bookId))];
	const suggested = await prisma.book.findMany({
		where: {
			...(categoryIds.length ? { categoryId: { in: categoryIds } } : {}),
			...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
			available: { gt: 0 },
		},
		include: { category: { select: { name: true } } },
		take: 8,
		orderBy: [{ featured: "desc" }, { rentals: { _count: "desc" } }],
	});
	const popularIds = popularCounts.map((item) => item.bookId);
	return NextResponse.json({
		monthlyReadingGoal: profile.monthlyReadingGoal,
		monthLoans,
		monthlyProgress: Math.min(100, Math.round((monthLoans / profile.monthlyReadingGoal) * 100)),
		totalLoans,
		activeLoans,
		preferredCategories: [...categoryCounts.entries()].map(([id, value]) => ({ id, ...value })).sort((a, b) => b.count - a.count),
		recommendations: suggested,
		popularBookIds: popularIds,
	});
}
