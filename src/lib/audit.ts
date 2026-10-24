import type { Prisma } from "@prisma/client";

type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

export function writeAuditLog(
	client: AuditClient,
	entry: {
		actorId?: string | null;
		action: string;
		entity: string;
		entityId?: string | null;
		metadata?: Prisma.InputJsonValue;
	},
) {
	return client.auditLog.create({
		data: {
			actorId: entry.actorId ?? null,
			action: entry.action,
			entity: entry.entity,
			entityId: entry.entityId ?? null,
			metadata: entry.metadata,
		},
	});
}
