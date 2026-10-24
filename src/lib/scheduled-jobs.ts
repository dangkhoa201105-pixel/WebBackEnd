import type { NotificationType, Prisma } from "@prisma/client";
import { expireReadyReservations } from "@/lib/library";

type JobTransaction = Prisma.TransactionClient;

export async function createDueLoanNotifications(tx: JobTransaction, now = new Date(), userId?: string) {
	const dueSoonUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000);
	const loans = await tx.rental.findMany({
		where: {
			status: "ACTIVE",
			dueDate: { lte: dueSoonUntil },
			...(userId ? { userId } : {}),
		},
		select: { id: true, userId: true, dueDate: true, book: { select: { title: true } } },
		orderBy: { dueDate: "asc" },
	});
	const notifications: Prisma.NotificationCreateManyInput[] = loans.map((loan) => {
		const overdue = loan.dueDate < now;
		const type: NotificationType = overdue ? "OVERDUE" : "DUE_SOON";
		return {
			userId: loan.userId,
			type,
			referenceId: loan.id,
			title: overdue ? "Sách đã quá hạn trả" : "Sắp đến hạn trả sách",
			message: `${loan.book.title} ${overdue ? "đã quá hạn" : "đến hạn"} vào ${loan.dueDate.toLocaleDateString("vi-VN")}.`,
		};
	});
	if (!notifications.length) return 0;
	const created = await tx.notification.createMany({ data: notifications, skipDuplicates: true });
	return created.count;
}

export async function runScheduledLibraryJobs(tx: JobTransaction, now = new Date()) {
	await expireReadyReservations(tx, now);
	const dueLoanNotifications = await createDueLoanNotifications(tx, now);
	const [expiredOnlineRentals, forfeitedDeposits] = await Promise.all([
		tx.rental.updateMany({
			where: { rentalMode: "ONLINE", status: "ACTIVE", dueDate: { lte: now } },
			data: { status: "EXPIRED" },
		}),
		tx.rental.updateMany({
			where: {
				rentalMode: "OFFLINE",
				status: "ACTIVE",
				dueDate: { lt: now },
				refundableDeposit: { gt: 0 },
				paidAt: { not: null },
				depositForfeitedAt: null,
			},
			data: { depositForfeitedAt: now },
		}),
	]);
	return {
		dueLoanNotifications,
		expiredOnlineRentals: expiredOnlineRentals.count,
		forfeitedDeposits: forfeitedDeposits.count,
	};
}
