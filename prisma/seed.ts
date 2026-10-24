import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { books, categories as bookCategories } from "../src/lib/books";

const prisma = new PrismaClient();
const slugify = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
	const passwordHash = await bcrypt.hash("BookNest@123", 12);
	const user = await prisma.user.upsert({
		where: { email: "admin@booknest.vn" },
		update: { phone: "0900000000" },
		create: { name: "BookNest Admin", email: "admin@booknest.vn", phone: "0900000000", passwordHash, role: "ADMIN" },
	});
	const customerPasswordHash = await bcrypt.hash("User@12345", 12);
	const customer = await prisma.user.upsert({
		where: { email: "customer@booknest.vn" },
		update: { phone: "0911111111" },
		create: { name: "BookNest Customer", email: "customer@booknest.vn", phone: "0911111111", passwordHash: customerPasswordHash },
	});
	const categoryByName = new Map<string, string>();
	for (const name of bookCategories.filter((category) => category !== "Tất cả")) {
		const slug = slugify(name);
		const category = await prisma.category.upsert({
			where: { name },
			update: { slug },
			create: { name, slug },
		});
		categoryByName.set(name, category.id);
	}
	for (const book of books) {
		const categoryId = categoryByName.get(book.category);
		if (!categoryId) throw new Error(`Missing category for seeded book: ${book.id}`);
		const slug = `${slugify(book.title)}-${book.id}`;
		const seededBook = await prisma.book.upsert({
			where: { slug },
			update: {
				title: book.title,
				author: book.author,
				description: book.description,
				coverUrl: book.cover,
				featured: book.featured ?? false,
				pricePerDay: book.pricePerDay,
				categoryId,
			},
			create: {
				title: book.title,
				slug,
				author: book.author,
				description: book.description,
				coverUrl: book.cover,
				featured: book.featured ?? false,
				pricePerDay: book.pricePerDay,
				stock: book.total,
				available: book.available,
				salePrice: book.pricePerDay * 10,
				saleStock: Math.max(1, Math.floor(book.total / 3)),
				categoryId,
			},
		});
		if (await prisma.bookCopy.count({ where: { bookId: seededBook.id } }) === 0) {
			for (let index = 0; index < book.total; index++) {
				await prisma.bookCopy.create({
					data: {
						bookId: seededBook.id,
						barcode: `BN-${randomUUID()}`,
						status: index < book.available ? "AVAILABLE" : "MAINTENANCE",
						condition: index < book.available ? "GOOD" : "MAINTENANCE",
						notes: index < book.available ? undefined : "Bản mẫu chưa được đưa vào lưu thông",
					},
				});
			}
			await prisma.book.update({
				where: { id: seededBook.id },
				data: { stock: book.total, available: book.available },
			});
			if (book.total > 0) {
				await prisma.inventoryMovement.create({
					data: { bookId: seededBook.id, type: "INTAKE", quantity: book.total, notes: "Bản sách mẫu" },
				});
			}
		}
	}
	console.log(`Seeded ${user.email}, ${customer.email}, ${bookCategories.length} categories and ${books.length} books`);
}

main().finally(() => prisma.$disconnect());
