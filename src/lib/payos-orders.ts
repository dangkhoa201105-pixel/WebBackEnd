import { OrderStatus, PaymentStatus } from "@prisma/client";
import { PayOS } from "@payos/node";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { recordInventoryMovement } from "@/lib/library";
import { writeAuditLog } from "@/lib/audit";
import { getPayosConfiguration, isPayosPaymentsEnabled } from "@/lib/payos";

type PayosOrder = {
	id: string;
	status: OrderStatus;
	paymentMethod: string;
	paymentStatus: PaymentStatus;
	total: number;
	paymentOrderCode: number | null;
	paymentLinkId: string | null;
	checkoutUrl: string | null;
	paymentExpiresAt: Date | null;
	items: Array<{ title: string; quantity: number; unitPrice: number }>;
};

export function createPayosOrderCode() {
	return randomInt(1_000_000_000, 2_147_483_647);
}

export async function createPayosCheckout(order: PayosOrder) {
	if (order.paymentMethod !== "PAYOS" || order.status !== "CONFIRMED" || order.paymentStatus !== "PENDING") {
		throw new Error("PAYOS_CHECKOUT_NOT_AVAILABLE");
	}
	if (order.checkoutUrl) return order.checkoutUrl;
	if (!order.paymentOrderCode || !order.paymentExpiresAt || order.paymentExpiresAt <= new Date()) {
		throw new Error("PAYOS_CHECKOUT_EXPIRED");
	}
	const { client, returnUrl, cancelUrl, maxAmount } = getPayosConfiguration();
	if (order.total > maxAmount) throw new Error("PAYOS_AMOUNT_LIMIT_EXCEEDED");

	const paymentLink = await client.paymentRequests.create({
		orderCode: order.paymentOrderCode,
		amount: order.total,
		description: `BN${String(order.paymentOrderCode).slice(-7)}`,
		items: order.items.map((item) => ({
			name: item.title.slice(0, 50),
			quantity: item.quantity,
			price: item.unitPrice,
		})),
		cancelUrl,
		returnUrl,
		expiredAt: Math.floor(order.paymentExpiresAt.getTime() / 1000),
	});
	const checkoutUrl = new URL(paymentLink.checkoutUrl);
	if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "pay.payos.vn") {
		throw new Error("PAYOS_CHECKOUT_URL_INVALID");
	}
	const saved = await prisma.order.updateMany({
		where: {
			id: order.id,
			paymentMethod: "PAYOS",
			paymentStatus: "PENDING",
			checkoutUrl: null,
		},
		data: {
			paymentLinkId: paymentLink.paymentLinkId,
			checkoutUrl: checkoutUrl.href,
		},
	});
	if (saved.count === 0) {
		const current = await prisma.order.findUnique({ where: { id: order.id }, select: { checkoutUrl: true } });
		if (current?.checkoutUrl) return current.checkoutUrl;
	}
	return checkoutUrl.href;
}

export async function applyPayosPayment(payment: {
	orderCode: number;
	amount: number;
	paymentLinkId: string;
	reference?: string;
}) {
	return prisma.$transaction(async (tx) => {
		const order = await tx.order.findUnique({
			where: { paymentOrderCode: payment.orderCode },
			select: {
				id: true,
				status: true,
				paymentMethod: true,
				paymentStatus: true,
				total: true,
				paymentLinkId: true,
			},
		});
		if (!order || order.paymentMethod !== "PAYOS") throw new Error("PAYOS_ORDER_NOT_FOUND");
		if (order.total !== payment.amount) throw new Error("PAYOS_AMOUNT_MISMATCH");
		if (order.paymentLinkId && order.paymentLinkId !== payment.paymentLinkId) {
			throw new Error("PAYOS_LINK_MISMATCH");
		}
		if (order.paymentStatus === "PAID") return { duplicate: true, expired: order.status === "EXPIRED" };
		if (order.status !== "CONFIRMED" && order.status !== "EXPIRED") {
			throw new Error("PAYOS_ORDER_NOT_PAYABLE");
		}

		const changed = await tx.order.updateMany({
			where: { id: order.id, paymentMethod: "PAYOS", paymentStatus: "PENDING" },
			data: {
				paymentStatus: "PAID",
				paymentLinkId: order.paymentLinkId ?? payment.paymentLinkId,
				paymentReference: payment.reference ?? null,
				paidAt: new Date(),
			},
		});
		if (changed.count !== 1) throw new Error("PAYOS_ORDER_NOT_PAYABLE");
		if (order.status === "EXPIRED") {
			await tx.securityAlert.create({
				data: {
					dedupeKey: `payos-late-payment-${order.id}`,
					type: "PAYMENT_AFTER_EXPIRY",
					severity: "HIGH",
					description: "PayOS ghi nhận thanh toán sau khi đơn hàng đã hết hạn; cần đối soát thủ công.",
					metadata: { orderId: order.id, orderCode: payment.orderCode },
				},
			});
		}
		await writeAuditLog(tx, {
			action: order.status === "EXPIRED" ? "order.payment_received_after_expiry" : "order.payment_received",
			entity: "order",
			entityId: order.id,
			metadata: { paymentMethod: "PAYOS", amount: payment.amount },
		});
		return { duplicate: false, expired: order.status === "EXPIRED" };
	});
}

async function expirePayosOrder(orderId: string) {
	return prisma.$transaction(async (tx) => {
		const order = await tx.order.findUnique({
			where: { id: orderId },
			include: { items: true },
		});
		if (!order || order.paymentMethod !== "PAYOS" || order.paymentStatus !== "PENDING" || order.status !== "CONFIRMED") {
			return false;
		}
		const changed = await tx.order.updateMany({
			where: { id: order.id, status: "CONFIRMED", paymentMethod: "PAYOS", paymentStatus: "PENDING" },
			data: { status: "EXPIRED" },
		});
		if (changed.count !== 1) return false;
		for (const item of order.items) {
			await tx.book.update({
				where: { id: item.bookId },
				data: { saleStock: { increment: item.quantity } },
			});
			await recordInventoryMovement(tx, {
				bookId: item.bookId,
				type: "SALE_RETURN",
				quantity: item.quantity,
				notes: "Hoàn tồn kho khi link PayOS đã hết hạn hoặc bị hủy",
				metadata: { orderId: order.id },
			});
		}
		await writeAuditLog(tx, {
			action: "order.payment_expired",
			entity: "order",
			entityId: order.id,
			metadata: { paymentMethod: "PAYOS" },
		});
		return true;
	});
}

async function recordPayosPartialPayment(orderId: string, amountPaid: number) {
	await prisma.securityAlert.createMany({
		data: [{
			dedupeKey: `payos-partial-payment-${orderId}`,
			type: "PAYOS_PARTIAL_PAYMENT",
			severity: "HIGH",
			description: "PayOS ghi nhận khoản thanh toán chưa đủ; đơn hàng cần được đối soát trước khi giải phóng tồn kho.",
			metadata: { orderId, amountPaid },
		}],
		skipDuplicates: true,
	});
}

export async function reconcileExpiredPayosOrders(now = new Date()) {
	if (!isPayosPaymentsEnabled()) return 0;
	const { client } = getPayosConfiguration();
	const orders = await prisma.order.findMany({
		where: {
			status: "CONFIRMED",
			paymentMethod: "PAYOS",
			paymentStatus: "PENDING",
			paymentExpiresAt: { lte: now },
			paymentOrderCode: { not: null },
		},
		select: { id: true, total: true, paymentOrderCode: true, paymentLinkId: true },
		orderBy: { paymentExpiresAt: "asc" },
		take: 50,
	});
	let expiredCount = 0;
	for (const order of orders) {
		if (!order.paymentOrderCode) continue;
		try {
			const paymentLink = order.paymentLinkId
				? await client.paymentRequests.get(order.paymentLinkId)
				: await client.paymentRequests.get(order.paymentOrderCode);
			if (paymentLink.status === "PAID") {
				if (paymentLink.amountPaid === order.total) {
					const reference = paymentLink.transactions[0]?.reference;
					await applyPayosPayment({
						orderCode: order.paymentOrderCode,
						amount: paymentLink.amountPaid,
						paymentLinkId: paymentLink.id,
						...(reference ? { reference } : {}),
					});
				} else {
					await recordPayosPartialPayment(order.id, paymentLink.amountPaid);
				}
				continue;
			}
			if (paymentLink.amountPaid > 0) {
				await recordPayosPartialPayment(order.id, paymentLink.amountPaid);
				continue;
			}
			let settled = paymentLink;
			if (paymentLink.status === "PENDING") {
				settled = order.paymentLinkId
					? await client.paymentRequests.cancel(order.paymentLinkId, "Order payment expired")
					: await client.paymentRequests.cancel(order.paymentOrderCode, "Order payment expired");
			}
			if (settled.amountPaid > 0) {
				if (settled.status === "PAID" && settled.amountPaid === order.total) {
					const reference = settled.transactions[0]?.reference;
					await applyPayosPayment({
						orderCode: order.paymentOrderCode,
						amount: settled.amountPaid,
						paymentLinkId: settled.id,
						...(reference ? { reference } : {}),
					});
				} else {
					await recordPayosPartialPayment(order.id, settled.amountPaid);
				}
				continue;
			}
			if (settled.status === "CANCELLED" || settled.status === "EXPIRED" || settled.status === "FAILED") {
				if (await expirePayosOrder(order.id)) expiredCount += 1;
			}
		} catch (error) {
			if (!(error instanceof PayOS.NotFoundError)) {
				console.error(JSON.stringify({
					event: "payos_expiration_reconciliation_failed",
					orderId: order.id,
					errorName: error instanceof Error ? error.name : "UnknownError",
					timestamp: new Date().toISOString(),
				}));
				continue;
			}
			if (await expirePayosOrder(order.id)) expiredCount += 1;
		}
	}
	return expiredCount;
}

export function isKnownPayosOrderError(error: unknown) {
	return error instanceof Error && [
		"PAYOS_CHECKOUT_NOT_AVAILABLE",
		"PAYOS_CHECKOUT_EXPIRED",
		"PAYOS_ORDER_NOT_PAYABLE",
		"PAYOS_ORDER_NOT_FOUND",
		"PAYOS_AMOUNT_LIMIT_EXCEEDED",
	].includes(error.message);
}
