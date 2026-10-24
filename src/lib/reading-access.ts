export type RentalReadingEntitlement = {
	rentalMode: "ONLINE" | "OFFLINE";
	status: "PENDING" | "ACTIVE" | "RETURNED" | "CANCELLED" | "EXPIRED";
	returnedAt: Date | null;
	dueDate: Date;
};

export type PurchaseReadingEntitlement = {
	status: "CONFIRMED" | "CANCELLED" | "EXPIRED";
	paymentStatus: "PENDING" | "PAID";
};

export function hasActiveRentalReadingAccess(
	rental: RentalReadingEntitlement | null,
	now = new Date(),
) {
	return Boolean(
		rental &&
		rental.rentalMode === "ONLINE" &&
		rental.status === "ACTIVE" &&
		!rental.returnedAt &&
		rental.dueDate.getTime() > now.getTime(),
	);
}

export function hasPermanentPurchaseReadingAccess(order: PurchaseReadingEntitlement | null) {
	return order?.status === "CONFIRMED" && order.paymentStatus === "PAID";
}
