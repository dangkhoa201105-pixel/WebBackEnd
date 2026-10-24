export type RentalMode = "ONLINE" | "OFFLINE";

export const RENTAL_PERIOD_DAYS = 7;
export const ONLINE_RENT_PERCENT = 70;
export const OFFLINE_RENT_PERCENT = 60;
export const OFFLINE_REFUND_PERCENT = 40;

export type RentalQuote = {
	rentalFee: number;
	amountDue: number;
	refundableDeposit: number;
};

export function getRentalQuote(bookPrice: number, rentalMode: RentalMode): RentalQuote {
	if (!Number.isSafeInteger(bookPrice) || bookPrice <= 0) {
		throw new Error("BOOK_PRICE_MUST_BE_POSITIVE");
	}
	if (rentalMode === "ONLINE") {
		const rentalFee = Math.round(bookPrice * ONLINE_RENT_PERCENT / 100);
		return { rentalFee, amountDue: rentalFee, refundableDeposit: 0 };
	}
	const rentalFee = Math.round(bookPrice * OFFLINE_RENT_PERCENT / 100);
	return { rentalFee, amountDue: bookPrice, refundableDeposit: bookPrice };
}

export function getOfflineDepositRefund(
	depositAmount: number,
	dueDate: Date,
	returnedAt: Date,
	alreadyForfeited = false,
) {
	if (alreadyForfeited || returnedAt.getTime() > dueDate.getTime()) return 0;
	return Math.round(depositAmount * OFFLINE_REFUND_PERCENT / 100);
}
