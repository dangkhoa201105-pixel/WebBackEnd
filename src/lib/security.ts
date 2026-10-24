import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

export function createSecurityAlert(
	tx: Prisma.TransactionClient,
	entry: {
		type: string;
		severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
		description: string;
		userId?: string | null;
		dedupeKey?: string;
		metadata?: Prisma.InputJsonValue;
	},
) {
	const dedupeKey = entry.dedupeKey ?? `${entry.type}:${randomUUID()}`;
	return tx.securityAlert.upsert({
		where: { dedupeKey },
		create: {
			dedupeKey,
			type: entry.type,
			severity: entry.severity,
			description: entry.description,
			userId: entry.userId ?? null,
			metadata: entry.metadata,
		},
		update: {
			severity: entry.severity,
			description: entry.description,
			metadata: entry.metadata,
			status: "OPEN",
		},
	});
}
