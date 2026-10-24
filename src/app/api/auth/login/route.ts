import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createSecurityAlert } from "@/lib/security";

const schema = z.object({
	email: z.string().trim().toLowerCase().email(),
	password: z.string().min(1).max(128),
});
const failedLoginLimit = 5;
const ipFailureLimit = 20;
const windowMs = 15 * 60 * 1000;
const dummyPasswordHash = "$2b$12$bSrT8NRI8bi83LaarGCr1OYjyNOthWkA.KLxonkmuz7qL9QRDstBS";
const invalidCredentials = { message: "Thông tin đăng nhập không chính xác hoặc tài khoản đã bị khóa" };

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Dữ liệu đăng nhập không hợp lệ" }, { status: 400 });
	}

	const parsed = schema.safeParse(body);
	if (!parsed.success) return NextResponse.json({ message: "Email hoặc mật khẩu không hợp lệ" }, { status: 400 });

	const email = parsed.data.email;
	const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || "unknown";
	const windowStart = new Date(Date.now() - windowMs);
	const [recentEmailFailures, recentIpFailures] = await Promise.all([
		prisma.loginAttempt.count({ where: { email, success: false, createdAt: { gte: windowStart } } }),
		prisma.loginAttempt.count({ where: { ipAddress, success: false, createdAt: { gte: windowStart } } }),
	]);
	const user = await prisma.user.findUnique({ where: { email } });

	if (recentEmailFailures >= failedLoginLimit || recentIpFailures >= ipFailureLimit) {
		await prisma.$transaction(async (tx) => {
			await tx.loginAttempt.create({ data: { email, ipAddress, success: false, userId: user?.id } });
			await writeAuditLog(tx, { actorId: user?.id, action: "auth.rate_limited", entity: "user", entityId: user?.id });
			await createSecurityAlert(tx, {
				type: "LOGIN_RATE_LIMIT",
				severity: "HIGH",
				description: "Login requests exceeded the configured account or IP threshold.",
				userId: user?.id,
				dedupeKey: `login-rate:${createHash("sha256").update(email).digest("hex")}:${Math.floor(Date.now() / windowMs)}`,
				metadata: { recentEmailFailures, recentIpFailures },
			});
		});
		return NextResponse.json({ message: "Quá nhiều lần đăng nhập. Vui lòng thử lại sau." }, { status: 429 });
	}

	const passwordMatches = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? dummyPasswordHash);
	if (!user || user.status !== "ACTIVE" || !passwordMatches) {
		await prisma.$transaction(async (tx) => {
			await tx.loginAttempt.create({ data: { email, ipAddress, success: false, userId: user?.id } });
			if (user?.status === "ACTIVE") {
				const updated = await tx.user.update({
					where: { id: user.id },
					data: { failedLoginAttempts: { increment: 1 } },
					select: { failedLoginAttempts: true },
				});
				if (updated.failedLoginAttempts >= failedLoginLimit) {
					await tx.user.update({ where: { id: user.id }, data: { status: "LOCKED" } });
				}
				if (updated.failedLoginAttempts >= 3) {
					await createSecurityAlert(tx, {
						type: "REPEATED_LOGIN_FAILURE",
						severity: updated.failedLoginAttempts >= failedLoginLimit ? "HIGH" : "MEDIUM",
						description: "Repeated failed sign-in attempts for an account.",
						userId: user.id,
						dedupeKey: `login-user:${user.id}:${Math.floor(Date.now() / windowMs)}`,
						metadata: { failedAttempts: updated.failedLoginAttempts },
					});
				}
			}
			await writeAuditLog(tx, { actorId: user?.id, action: "auth.login_failed", entity: "user", entityId: user?.id });
		});
		return NextResponse.json(invalidCredentials, { status: 401 });
	}

	const loginSession = await prisma.$transaction(async (tx) => {
		await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0 } });
		await tx.loginAttempt.create({ data: { email, ipAddress, success: true, userId: user.id } });
		await writeAuditLog(tx, { actorId: user.id, action: "auth.login_succeeded", entity: "user", entityId: user.id });
		return tx.loginSession.create({
			data: {
				userId: user.id,
				ipAddress,
				userAgent: request.headers.get("user-agent")?.slice(0, 512),
				expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			},
		});
	});

	const response = NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } });
	response.cookies.set("booknest_token", await createToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion, sessionId: loginSession.id }), {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		maxAge: 60 * 60 * 24 * 7,
		path: "/",
	});
	return response;
}
