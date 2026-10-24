import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { expireReadyReservations, promoteNextReservation, refreshBookInventory } from "@/lib/library";

type ReservationTransaction = Prisma.TransactionClient;

export async function createReservation(
	tx: ReservationTransaction,
	input: { userId: string; bookId: string },
) {
	await expireReadyReservations(tx);
	const book = await tx.book.findUnique({ where: { id: input.bookId }, select: { id: true } });
	if (!book) throw new Error("BOOK_NOT_FOUND");

	const activeLoan = await tx.rental.findFirst({
		where: { userId: input.userId, bookId: book.id, status: "ACTIVE" },
		select: { id: true },
	});
	if (activeLoan) throw new Error("ALREADY_BORROWED");

	const created = await tx.reservation.create({
		data: { userId: input.userId, bookId: book.id },
	});
	const copy = await tx.bookCopy.findFirst({
		where: { bookId: book.id, status: "AVAILABLE" },
		orderBy: [{ acquiredAt: "asc" }, { barcode: "asc" }],
	});
	if (copy) await promoteNextReservation(tx, book.id, copy.id, input.userId);
	await refreshBookInventory(tx, book.id);
	await writeAuditLog(tx, {
		actorId: input.userId,
		action: "reservation.created",
		entity: "reservation",
		entityId: created.id,
	});

	return tx.reservation.findUniqueOrThrow({
		where: { id: created.id },
		include: {
			book: { select: { id: true, title: true } },
			copy: { select: { barcode: true } },
		},
	});
}
