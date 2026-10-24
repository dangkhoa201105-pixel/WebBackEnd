import assert from "node:assert/strict";
import { test } from "node:test";
import { hasActiveRentalReadingAccess, hasPermanentPurchaseReadingAccess } from "../src/lib/reading-access";

const now = new Date("2026-10-23T12:00:00.000Z");

test("rental reading access ends at due time and on return", () => {
	assert.equal(hasActiveRentalReadingAccess({
		rentalMode: "ONLINE",
		status: "ACTIVE",
		returnedAt: null,
		dueDate: new Date("2026-10-24T12:00:00.000Z"),
	}, now), true);

	assert.equal(hasActiveRentalReadingAccess({
		rentalMode: "ONLINE",
		status: "ACTIVE",
		returnedAt: null,
		dueDate: now,
	}, now), false);

	assert.equal(hasActiveRentalReadingAccess({
		rentalMode: "ONLINE",
		status: "ACTIVE",
		returnedAt: now,
		dueDate: new Date("2026-10-24T12:00:00.000Z"),
	}, now), false);

	assert.equal(hasActiveRentalReadingAccess({
		rentalMode: "ONLINE",
		status: "RETURNED",
		returnedAt: null,
		dueDate: new Date("2026-10-24T12:00:00.000Z"),
	}, now), false);
	assert.equal(hasActiveRentalReadingAccess({
		rentalMode: "OFFLINE",
		status: "ACTIVE",
		returnedAt: null,
		dueDate: new Date("2026-10-24T12:00:00.000Z"),
	}, now), false);
});

test("permanent reading access requires a confirmed paid order", () => {
	assert.equal(hasPermanentPurchaseReadingAccess({ status: "CONFIRMED", paymentStatus: "PAID" }), true);
	assert.equal(hasPermanentPurchaseReadingAccess({ status: "CONFIRMED", paymentStatus: "PENDING" }), false);
	assert.equal(hasPermanentPurchaseReadingAccess({ status: "CANCELLED", paymentStatus: "PAID" }), false);
	assert.equal(hasPermanentPurchaseReadingAccess(null), false);
});
