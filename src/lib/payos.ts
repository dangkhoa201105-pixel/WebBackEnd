import { PayOS, type Webhook } from "@payos/node";
import { z } from "zod";

const confirmationPhrase = "I_UNDERSTAND_REAL_PAYMENTS";
const webhookSchema = z.object({
	code: z.string(),
	desc: z.string(),
	success: z.boolean(),
	data: z.object({
		orderCode: z.number().int().positive(),
		amount: z.number().int().nonnegative(),
		description: z.string(),
		accountNumber: z.string(),
		reference: z.string(),
		transactionDateTime: z.string(),
		currency: z.string(),
		paymentLinkId: z.string(),
		code: z.string(),
		desc: z.string(),
	}).passthrough(),
	signature: z.string().min(1),
}).passthrough();

export class PayosConfigurationError extends Error {}

export function isPayosPaymentsEnabled() {
	return process.env.PAYOS_REAL_PAYMENTS_ENABLED === "true" &&
		process.env.PAYOS_REAL_PAYMENTS_CONFIRMATION === confirmationPhrase;
}

export function getPayosConfiguration() {
	if (!isPayosPaymentsEnabled()) {
		throw new PayosConfigurationError("PayOS payments are disabled until explicitly enabled");
	}
	const clientId = process.env.PAYOS_CLIENT_ID;
	const apiKey = process.env.PAYOS_API_KEY;
	const checksumKey = process.env.PAYOS_CHECKSUM_KEY;
	const returnUrl = process.env.PAYOS_RETURN_URL;
	const cancelUrl = process.env.PAYOS_CANCEL_URL;
	const maxAmount = Number(process.env.PAYOS_MAX_PAYMENT_AMOUNT_VND);

	if (!clientId || !apiKey || !checksumKey || !returnUrl || !cancelUrl ||
		!Number.isSafeInteger(maxAmount) || maxAmount < 1 || maxAmount > 2_000_000_000) {
		throw new PayosConfigurationError("PayOS credentials, URLs, and a valid payment limit are required");
	}
	for (const value of [returnUrl, cancelUrl]) {
		let url: URL;
		try {
			url = new URL(value);
		} catch {
			throw new PayosConfigurationError("PayOS return and cancel URLs must be absolute URLs");
		}
		if ((url.protocol !== "https:" && url.protocol !== "http:") ||
			(process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
			throw new PayosConfigurationError("PayOS URLs must use HTTPS in production");
		}
	}

	return {
		client: new PayOS({ clientId, apiKey, checksumKey, logLevel: "off" }),
		returnUrl,
		cancelUrl,
		maxAmount,
	};
}

export function isPayosConfigurationReady() {
	try {
		getPayosConfiguration();
		return true;
	} catch (error) {
		if (error instanceof PayosConfigurationError) return false;
		throw error;
	}
}

export async function verifyPayosWebhook(input: unknown) {
	const parsed = webhookSchema.safeParse(input);
	if (!parsed.success) throw new Error("INVALID_PAYOS_WEBHOOK");
	const { client } = getPayosConfiguration();
	return client.webhooks.verify(parsed.data as Webhook);
}
