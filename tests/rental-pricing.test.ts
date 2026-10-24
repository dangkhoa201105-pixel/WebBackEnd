import assert from "node:assert/strict";
import { test } from "node:test";
import {
	getOfflineDepositRefund,
	getRentalQuote,
	OFFLINE_REFUND_PERCENT,
	OFFLINE_RENT_PERCENT,
	ONLINE_RENT_PERCENT,
	RENTAL_PERIOD_DAYS,
} from "../src/lib/rental-pricing";

test("online 7-day rental charges 70 percent without a physical deposit", () => {
	assert.equal(RENTAL_PERIOD_DAYS, 7);
	assert.equal(ONLINE_RENT_PERCENT, 70);
	assert.deepEqual(getRentalQuote(100_000, "ONLINE"), {
		rentalFee: 70_000,
		amountDue: 70_000,
		refundableDeposit: 0,
	});
});

test("offline rental collects full book value and retains 60 percent as its fee", () => {
	assert.equal(OFFLINE_RENT_PERCENT, 60);
	assert.equal(OFFLINE_REFUND_PERCENT, 40);
	assert.deepEqual(getRentalQuote(100_000, "OFFLINE"), {
		rentalFee: 60_000,
		amountDue: 100_000,
		refundableDeposit: 100_000,
	});
});

test("offline deposit refund is simulated only when returned by the due date", () => {
	const dueDate = new Date("2026-10-30T12:00:00.000Z");
	assert.equal(getOfflineDepositRefund(100_000, dueDate, dueDate), 40_000);
	assert.equal(getOfflineDepositRefund(100_000, dueDate, new Date(dueDate.getTime() + 1)), 0);
	assert.equal(getOfflineDepositRefund(100_000, dueDate, new Date(dueDate.getTime() - 1), true), 0);
});

test("rental pricing rejects missing or invalid book value", () => {
	assert.throws(() => getRentalQuote(0, "ONLINE"), /BOOK_PRICE_MUST_BE_POSITIVE/);
	assert.throws(() => getRentalQuote(-1, "OFFLINE"), /BOOK_PRICE_MUST_BE_POSITIVE/);
	assert.throws(() => getRentalQuote(1.5, "OFFLINE"), /BOOK_PRICE_MUST_BE_POSITIVE/);
});
