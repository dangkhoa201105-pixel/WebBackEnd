import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
	const session = await getSession();
	if (!session || (session.role !== "ADMIN" && session.role !== "LIBRARIAN")) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}
	const books = await prisma.book.findMany({
		select: { id: true, title: true, author: true, stock: true, available: true },
		orderBy: { title: "asc" },
	});
	return NextResponse.json(books);
}
