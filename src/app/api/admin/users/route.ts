import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createSecurityAlert } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
	const session = await requireAdmin();
	if (!session) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	const url = new URL(request.url);
	const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
	const role = url.searchParams.get("role");
	const status = url.searchParams.get("status");
	const users = await prisma.user.findMany({
		where: {
			...(role === "USER" || role === "LIBRARIAN" || role === "ADMIN" ? { role } : {}),
			...(status === "ACTIVE" || status === "LOCKED" ? { status } : {}),
			...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
		},
		include: { _count: { select: { rentals: true, orders: true } } },
		orderBy: { createdAt: "desc" },
	});
	return NextResponse.json(users.map(({ id, name, email, phone, role: userRole, status: userStatus, _count, createdAt }) => ({
		id, name, email, phone, role: userRole, status: userStatus, _count, createdAt,
	})));
}

const updateSchema = z.object({
	id: z.string().min(1),
	role: z.enum(["USER", "LIBRARIAN", "ADMIN"]).optional(),
	status: z.enum(["ACTIVE", "LOCKED"]).optional(),
}).refine(({ role, status }) => role !== undefined || status !== undefined);

export async function PATCH(request: Request) {
	const session = await requireAdmin();
	if (!session) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
	}
	const input = updateSchema.safeParse(body);
	if (!input.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
	const { id, ...changes } = input.data;
	if (id === session.userId && (changes.role !== undefined || changes.status === "LOCKED")) {
		return NextResponse.json({ message: "Không thể đổi quyền hoặc khóa chính tài khoản đang dùng" }, { status: 400 });
	}

	try {
		const user = await prisma.$transaction(async (tx) => {
			const current = await tx.user.findUnique({ where: { id } });
			if (!current) throw new Error("USER_NOT_FOUND");
			const demotingAdmin = current.role === "ADMIN" && changes.role !== undefined && changes.role !== "ADMIN";
			const lockingAdmin = current.role === "ADMIN" && current.status === "ACTIVE" && changes.status === "LOCKED";
			if (demotingAdmin || lockingAdmin) {
				const activeAdmins = await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
				if (activeAdmins <= 1) throw new Error("LAST_ADMIN");
			}
			const updated = await tx.user.update({
				where: { id },
				data: {
					...changes,
					tokenVersion: { increment: 1 },
					...(changes.status === "ACTIVE" ? { failedLoginAttempts: 0 } : {}),
				},
			});
			await tx.loginSession.updateMany({
				where: { userId: id, revokedAt: null },
				data: { revokedAt: new Date() },
			});
			await writeAuditLog(tx, {
				actorId: session.userId,
				action: changes.role !== undefined ? "user.role_changed" : `user.status_${changes.status?.toLowerCase()}`,
				entity: "user",
				entityId: id,
				metadata: changes,
			});
			if (changes.role !== undefined || changes.status === "LOCKED") {
				await createSecurityAlert(tx, {
					type: changes.role !== undefined ? "ROLE_CHANGED" : "ACCOUNT_LOCKED",
					severity: "HIGH",
					description: changes.role !== undefined ? "An account role was changed by an administrator." : "An account was locked by an administrator.",
					userId: id,
					metadata: { actorId: session.userId, ...changes },
				});
			}
			return updated;
		});
		return NextResponse.json({ id: user.id, role: user.role, status: user.status });
	} catch (error) {
		if (error instanceof Error && error.message === "USER_NOT_FOUND") {
			return NextResponse.json({ message: "Không tìm thấy tài khoản" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "LAST_ADMIN") {
			return NextResponse.json({ message: "Hệ thống phải duy trì ít nhất một quản trị viên đang hoạt động" }, { status: 409 });
		}
		throw error;
	}
}

export async function DELETE(request: Request) {
	const session = await requireAdmin();
	if (!session) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	const id = new URL(request.url).searchParams.get("id");
	if (!id || id === session.userId) return NextResponse.json({ message: "Không thể khóa tài khoản này" }, { status: 400 });
	try {
		const user = await prisma.$transaction(async (tx) => {
			const target = await tx.user.findUnique({ where: { id } });
			if (!target) throw new Error("USER_NOT_FOUND");
			if (target.role === "ADMIN" && target.status === "ACTIVE") {
				const activeAdmins = await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
				if (activeAdmins <= 1) throw new Error("LAST_ADMIN");
			}
			const locked = await tx.user.update({ where: { id }, data: { status: "LOCKED" } });
			await tx.loginSession.updateMany({
				where: { userId: id, revokedAt: null },
				data: { revokedAt: new Date() },
			});
			await writeAuditLog(tx, { actorId: session.userId, action: "user.status_locked", entity: "user", entityId: id });
			await createSecurityAlert(tx, {
				type: "ACCOUNT_LOCKED",
				severity: "HIGH",
				description: "An account was locked by an administrator.",
				userId: id,
				metadata: { actorId: session.userId },
			});
			return locked;
		});
		return NextResponse.json({ ok: true, id: user.id, status: user.status });
	} catch (error) {
		if (error instanceof Error && error.message === "USER_NOT_FOUND") {
			return NextResponse.json({ message: "Không tìm thấy tài khoản" }, { status: 404 });
		}
		if (error instanceof Error && error.message === "LAST_ADMIN") {
			return NextResponse.json({ message: "Không thể khóa quản trị viên đang hoạt động cuối cùng" }, { status: 409 });
		}
		throw error;
	}
}
