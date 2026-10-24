import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("library jobs expire a ready hold, promote its queue, and create overdue reminders", {
	skip: !testDatabaseUrl && "Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.",
}, async () => {
	const { runScheduledLibraryJobs } = await import("../src/lib/scheduled-jobs");
	const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl! } } });
	const suffix = randomUUID();
	const now = new Date();
	const category = await prisma.category.create({
		data: { name: `Integration ${suffix}`, slug: `integration-${suffix}` },
	});
	const [user, waitingUser] = await Promise.all([0, 1].map((index) => prisma.user.create({
		data: {
			name: "Integration Test",
			email: `integration-${suffix}-${index}@example.test`,
			passwordHash: "unused",
		},
	})));
	const book = await prisma.book.create({
		data: {
			title: "Integration Fixture",
			slug: `integration-${suffix}`,
			author: "Test",
			description: "Disposable integration test data",
			pricePerDay: 1000,
			categoryId: category.id,
		},
	});
	try {
		const [heldCopy, loanCopy] = await Promise.all([
			prisma.bookCopy.create({ data: { bookId: book.id, barcode: `T-${suffix}-1`, status: "RESERVED" } }),
			prisma.bookCopy.create({ data: { bookId: book.id, barcode: `T-${suffix}-2`, status: "ON_LOAN", condition: "ON_LOAN" } }),
		]);
		const readyReservation = await prisma.reservation.create({
			data: { userId: user.id, bookId: book.id, copyId: heldCopy.id, status: "READY", readyUntil: new Date(now.getTime() - 1000) },
		});
		const waitingReservation = await prisma.reservation.create({
			data: { userId: waitingUser.id, bookId: book.id, status: "WAITING" },
		});
		const rental = await prisma.rental.create({
			data: {
				userId: user.id,
				bookId: book.id,
				copyId: loanCopy.id,
				startDate: new Date(now.getTime() - 14 * 86_400_000),
				dueDate: new Date(now.getTime() - 86_400_000),
				days: 7,
				total: 7000,
				status: "ACTIVE",
			},
		});
		const onlineRental = await prisma.rental.create({
			data: {
				userId: user.id,
				bookId: book.id,
				rentalMode: "ONLINE",
				startDate: new Date(now.getTime() - 8 * 86_400_000),
				dueDate: new Date(now.getTime() - 86_400_000),
				days: 7,
				total: 70_000,
				amountPaid: 70_000,
				paidAt: new Date(now.getTime() - 8 * 86_400_000),
				status: "ACTIVE",
			},
		});
		const physicalRental = await prisma.rental.create({
			data: {
				userId: user.id,
				bookId: book.id,
				rentalMode: "OFFLINE",
				startDate: new Date(now.getTime() - 8 * 86_400_000),
				dueDate: new Date(now.getTime() - 86_400_000),
				days: 7,
				total: 60_000,
				amountPaid: 100_000,
				refundableDeposit: 100_000,
				paidAt: new Date(now.getTime() - 8 * 86_400_000),
				status: "ACTIVE",
			},
		});

		const jobResult = await prisma.$transaction((tx) => runScheduledLibraryJobs(tx, now));

		const [readyAfter, waitingAfter, promotedCopy, overdueNotification, onlineAfter, physicalAfter] = await Promise.all([
			prisma.reservation.findUniqueOrThrow({ where: { id: readyReservation.id } }),
			prisma.reservation.findUniqueOrThrow({ where: { id: waitingReservation.id } }),
			prisma.bookCopy.findUniqueOrThrow({ where: { id: heldCopy.id } }),
			prisma.notification.findFirst({ where: { userId: user.id, type: "OVERDUE", referenceId: rental.id } }),
			prisma.rental.findUniqueOrThrow({ where: { id: onlineRental.id } }),
			prisma.rental.findUniqueOrThrow({ where: { id: physicalRental.id } }),
		]);
		assert.equal(readyAfter.status, "EXPIRED");
		assert.equal(waitingAfter.status, "READY");
		assert.equal(waitingAfter.copyId, heldCopy.id);
		assert.equal(promotedCopy.status, "RESERVED");
		assert.ok(overdueNotification);
		assert.equal(onlineAfter.status, "EXPIRED");
		assert.ok(physicalAfter.depositForfeitedAt);
		assert.equal(jobResult.expiredOnlineRentals, 1);
		assert.equal(jobResult.forfeitedDeposits, 1);
	} finally {
		await prisma.rental.deleteMany({ where: { bookId: book.id } });
		await prisma.notification.deleteMany({ where: { userId: user.id } });
		await prisma.reservation.deleteMany({ where: { bookId: book.id } });
		await prisma.bookCopy.deleteMany({ where: { bookId: book.id } });
		await prisma.inventoryMovement.deleteMany({ where: { bookId: book.id } });
		await prisma.book.delete({ where: { id: book.id } });
		await prisma.user.deleteMany({ where: { id: { in: [user.id, waitingUser.id] } } });
		await prisma.category.delete({ where: { id: category.id } });
		await prisma.$disconnect();
	}
});

test("parallel loan claims consume separate available copies without double-claiming", {
	skip: !testDatabaseUrl && "Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.",
}, async () => {
	const { takeAvailableCopy } = await import("../src/lib/library");
	const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl! } } });
	const suffix = randomUUID();
	const category = await prisma.category.create({ data: { name: `Claim ${suffix}`, slug: `claim-${suffix}` } });
	const book = await prisma.book.create({
		data: {
			title: "Claim Fixture",
			slug: `claim-${suffix}`,
			author: "Test",
			description: "Disposable concurrency test data",
			pricePerDay: 1000,
			categoryId: category.id,
		},
	});
	try {
		await prisma.bookCopy.createMany({
			data: [
				{ bookId: book.id, barcode: `C-${suffix}-1` },
				{ bookId: book.id, barcode: `C-${suffix}-2` },
			],
		});
		const results = await Promise.all([
			prisma.$transaction((tx) => takeAvailableCopy(tx, book.id)),
			prisma.$transaction((tx) => takeAvailableCopy(tx, book.id)),
		]);
		assert.equal(results.filter(Boolean).length, 2);
		assert.equal(new Set(results.map((copy) => copy?.id)).size, 2);
		assert.equal(await prisma.bookCopy.count({ where: { bookId: book.id, status: "ON_LOAN" } }), 2);
	} finally {
		await prisma.bookCopy.deleteMany({ where: { bookId: book.id } });
		await prisma.book.delete({ where: { id: book.id } });
		await prisma.category.delete({ where: { id: category.id } });
		await prisma.$disconnect();
	}
});

test("reservation service commits reservation, copy hold, audit log, and notification atomically", {
	skip: !testDatabaseUrl && "Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL database.",
}, async () => {
	const { createReservation } = await import("../src/lib/services/reservation-service");
	const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl! } } });
	const suffix = randomUUID();
	const category = await prisma.category.create({ data: { name: `Reservation ${suffix}`, slug: `reservation-${suffix}` } });
	const user = await prisma.user.create({
		data: { name: "Reservation Test", email: `reservation-${suffix}@example.test`, passwordHash: "unused" },
	});
	const book = await prisma.book.create({
		data: {
			title: "Reservation Fixture",
			slug: `reservation-${suffix}`,
			author: "Test",
			description: "Disposable reservation-service fixture",
			pricePerDay: 1000,
			categoryId: category.id,
		},
	});
	try {
		const copy = await prisma.bookCopy.create({ data: { bookId: book.id, barcode: `R-${suffix}` } });
		const reservation = await prisma.$transaction((tx) => createReservation(tx, { userId: user.id, bookId: book.id }));
		const [persistedCopy, movement, audit, notification] = await Promise.all([
			prisma.bookCopy.findUniqueOrThrow({ where: { id: copy.id } }),
			prisma.inventoryMovement.findFirst({ where: { bookId: book.id, type: "RESERVED" } }),
			prisma.auditLog.findFirst({ where: { entityId: reservation.id, action: "reservation.created" } }),
			prisma.notification.findFirst({
				where: { userId: user.id, type: "RESERVATION_READY", referenceId: reservation.id },
			}),
		]);
		assert.equal(reservation.status, "READY");
		assert.equal(reservation.copyId, copy.id);
		assert.equal(persistedCopy.status, "RESERVED");
		assert.ok(movement);
		assert.ok(audit);
		assert.ok(notification);

		await assert.rejects(
			prisma.$transaction((tx) => createReservation(tx, { userId: user.id, bookId: book.id })),
			(error: unknown) => error instanceof Error && "code" in error && error.code === "P2002",
		);
		assert.equal(await prisma.reservation.count({ where: { userId: user.id, bookId: book.id } }), 1);
	} finally {
		await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
		await prisma.inventoryMovement.deleteMany({ where: { bookId: book.id } });
		await prisma.notification.deleteMany({ where: { userId: user.id } });
		await prisma.reservation.deleteMany({ where: { bookId: book.id } });
		await prisma.bookCopy.deleteMany({ where: { bookId: book.id } });
		await prisma.book.delete({ where: { id: book.id } });
		await prisma.user.delete({ where: { id: user.id } });
		await prisma.category.delete({ where: { id: category.id } });
		await prisma.$disconnect();
	}
});
