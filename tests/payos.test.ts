import assert from "node:assert/strict";
import { PayOS } from "@payos/node";
import { test } from "node:test";

const payosEnvironmentKeys = [
	"PAYOS_CLIENT_ID",
	"PAYOS_API_KEY",
	"PAYOS_CHECKSUM_KEY",
	"PAYOS_RETURN_URL",
	"PAYOS_CANCEL_URL",
	"PAYOS_MAX_PAYMENT_AMOUNT_VND",
	"PAYOS_REAL_PAYMENTS_ENABLED",
	"PAYOS_REAL_PAYMENTS_CONFIRMATION",
] as const;

function setPayosTestEnvironment(enabled: boolean) {
	const previous = new Map(payosEnvironmentKeys.map((key) => [key, process.env[key]]));
	process.env.PAYOS_CLIENT_ID = "test-client";
	process.env.PAYOS_API_KEY = "test-api-key";
	process.env.PAYOS_CHECKSUM_KEY = "test-checksum-key";
	process.env.PAYOS_RETURN_URL = "http://localhost:3000/account/history?payment=success";
	process.env.PAYOS_CANCEL_URL = "http://localhost:3000/account/history?payment=cancel";
	process.env.PAYOS_MAX_PAYMENT_AMOUNT_VND = "1000";
	process.env.PAYOS_REAL_PAYMENTS_ENABLED = enabled ? "true" : "false";
	process.env.PAYOS_REAL_PAYMENTS_CONFIRMATION = enabled ? "I_UNDERSTAND_REAL_PAYMENTS" : "";
	return () => {
		for (const [key, value] of previous) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	};
}

test("PayOS is disabled unless both explicit live-payment flags are set", async () => {
	const restore = setPayosTestEnvironment(false);
	try {
		const { getPayosConfiguration, PayosConfigurationError } = await import("../src/lib/payos");
		assert.throws(() => getPayosConfiguration(), PayosConfigurationError);
	} finally {
		restore();
	}
});

test("PayOS rejects webhook data with a changed amount", async () => {
	const restore = setPayosTestEnvironment(true);
	try {
		const { verifyPayosWebhook } = await import("../src/lib/payos");
		const checksumKey = process.env.PAYOS_CHECKSUM_KEY!;
		const client = new PayOS({
			clientId: process.env.PAYOS_CLIENT_ID,
			apiKey: process.env.PAYOS_API_KEY,
			checksumKey,
		});
		const data = {
			orderCode: 1234567890,
			amount: 1000,
			description: "BOOKNEST",
			accountNumber: "12345678",
			reference: "TEST-REFERENCE",
			transactionDateTime: "2026-10-23 12:00:00",
			currency: "VND",
			paymentLinkId: "test-payment-link",
			code: "00",
			desc: "Thành công",
		};
		const signature = await client.crypto.createSignatureFromObj(data, checksumKey);
		assert.ok(signature);
		const valid = await verifyPayosWebhook({
			code: "00",
			desc: "success",
			success: true,
			data,
			signature,
		});
		assert.equal(valid.amount, 1000);
		await assert.rejects(verifyPayosWebhook({
			code: "00",
			desc: "success",
			success: true,
			data: { ...data, amount: 999 },
			signature,
		}));
	} finally {
		restore();
	}
});
