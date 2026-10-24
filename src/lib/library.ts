import type { InventoryMovementType, Prisma } from "@prisma/client";

type LibraryTransaction = Prisma.TransactionClient;

export async function refreshBookInventory(tx: LibraryTransaction, bookId: string) {
	const [total, available] = await Promise.all([
		tx.bookCopy.count({ where: { bookId, status: { notIn: ["LOST", "DISPOSED"] } } }),
		tx.bookCopy.count({ where: { bookId, status: "AVAILABLE" } }),
	]);
	await tx.book.update({ where: { id: bookId }, data: { stock: total, available } });
}

export async function takeAvailableCopy(tx: LibraryTransaction, bookId: string) {
	const copies = await tx.bookCopy.findMany({
		where: { bookId, status: "AVAILABLE" },
		orderBy: [{ acquiredAt: "asc" }, { barcode: "asc" }],
		select: { id: true },
	});
	for (const copy of copies) {
		const claimed = await tx.bookCopy.updateMany({
			where: { id: copy.id, status: "AVAILABLE" },
			data: { status: "ON_LOAN", condition: "ON_LOAN" },
		});
		if (claimed.count === 1) return copy;
	}
	return null;
}

export function recordInventoryMovement(
	tx: LibraryTransaction,
	entry: {
		bookId: string;
		copyId?: string | null;
		actorId?: string | null;
		type: InventoryMovementType;
		quantity: number;
		notes?: string;
		metadata?: Prisma.InputJsonValue;
	},
) {
	return tx.inventoryMovement.create({
		data: {
			bookId: entry.bookId,
			copyId: entry.copyId ?? null,
			actorId: entry.actorId ?? null,
			type: entry.type,
			quantity: entry.quantity,
			notes: entry.notes,
			metadata: entry.metadata,
		},
	});
}

export async function promoteNextReservation(
	tx: LibraryTransaction,
	bookId: string,
	copyId: string,
	actorId?: string | null,
) {
	const next = await tx.reservation.findFirst({
		where: { bookId, status: "WAITING" },
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
	});
	if (!next) {
		await tx.bookCopy.update({ where: { id: copyId }, data: { status: "AVAILABLE", condition: "GOOD" } });
		await recordInventoryMovement(tx, { bookId, copyId, actorId, type: "RESERVATION_RELEASE", quantity: 1 });
		await refreshBookInventory(tx, bookId);
		return null;
	}

	const readyUntil = new Date(Date.now() + 48 * 60 * 60 * 1000);
	const reserved = await tx.reservation.updateMany({
		where: { id: next.id, status: "WAITING" },
		data: { status: "READY", copyId, readyUntil },
	});
	if (reserved.count !== 1) throw new Error("RESERVATION_QUEUE_RACE");
	await tx.bookCopy.update({ where: { id: copyId }, data: { status: "RESERVED" } });
	await tx.notification.upsert({
		where: { userId_type_referenceId: { userId: next.userId, type: "RESERVATION_READY", referenceId: next.id } },
		create: {
			userId: next.userId,
			type: "RESERVATION_READY",
			title: "Sách bạn đặt trước đã sẵn sàng",
			message: "Vui lòng xác nhận mượn trong vòng 48 giờ.",
			referenceId: next.id,
		},
		update: {},
	});
	await recordInventoryMovement(tx, {
		bookId,
		copyId,
		actorId,
		type: "RESERVED",
		quantity: 1,
		metadata: { reservationId: next.id },
	});
	await refreshBookInventory(tx, bookId);
	return next;
}

export async function expireReadyReservations(tx: LibraryTransaction, now = new Date()) {
	const expired = await tx.reservation.findMany({
		where: { status: "READY", readyUntil: { lte: now } },
		orderBy: [{ readyUntil: "asc" }, { id: "asc" }],
	});
	for (const reservation of expired) {
		const updated = await tx.reservation.updateMany({
			where: { id: reservation.id, status: "READY", readyUntil: { lte: now } },
			data: { status: "EXPIRED", copyId: null },
		});
		if (updated.count !== 1 || !reservation.copyId) continue;
		await promoteNextReservation(tx, reservation.bookId, reservation.copyId);
	}
}
