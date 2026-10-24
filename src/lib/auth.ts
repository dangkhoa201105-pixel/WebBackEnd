import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const jwtSecret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === "production" && (!jwtSecret || jwtSecret.length < 32)) {
	throw new Error("JWT_SECRET must be at least 32 characters in production");
}
const secret = new TextEncoder().encode(jwtSecret || "development-secret-change-me");
export type UserRole = "USER" | "LIBRARIAN" | "ADMIN";
export type Session = { userId: string; role: UserRole; tokenVersion: number; sessionId: string };

export const createToken = (payload: Session) =>
	new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);

export async function verifyToken(token: string): Promise<Session | null> {
	const { payload } = await jwtVerify(token, secret);
	if (
		typeof payload.userId !== "string" ||
		(payload.role !== "USER" && payload.role !== "LIBRARIAN" && payload.role !== "ADMIN") ||
		typeof payload.tokenVersion !== "number" ||
		typeof payload.sessionId !== "string"
	) return null;
	return { userId: payload.userId, role: payload.role, tokenVersion: payload.tokenVersion, sessionId: payload.sessionId };
}

export async function getSession() {
	const token = (await cookies()).get("booknest_token")?.value;
	if (!token) return null;
	let claims: Session | null;
	try {
		claims = await verifyToken(token);
	} catch {
		return null;
	}
	if (!claims) return null;

	const [user, loginSession] = await Promise.all([
		prisma.user.findUnique({
		where: { id: claims.userId },
		select: { id: true, role: true, status: true, tokenVersion: true },
		}),
		prisma.loginSession.findFirst({
			where: { id: claims.sessionId, userId: claims.userId, revokedAt: null, expiresAt: { gt: new Date() } },
			select: { id: true, lastSeenAt: true },
		}),
	]);
	if (!user || !loginSession || user.status !== "ACTIVE" || user.tokenVersion !== claims.tokenVersion) return null;
	const lastSeenThreshold = new Date(Date.now() - 5 * 60 * 1000);
	if (loginSession.lastSeenAt < lastSeenThreshold) {
		await prisma.loginSession.updateMany({
			where: { id: loginSession.id, revokedAt: null, lastSeenAt: { lt: lastSeenThreshold } },
			data: { lastSeenAt: new Date() },
		});
	}
	return { userId: user.id, role: user.role, tokenVersion: user.tokenVersion, sessionId: loginSession.id };
}

export async function requireAdmin() {
	const session = await getSession();
	return session?.role === "ADMIN" ? session : null;
}

export async function requireStaff() {
	const session = await getSession();
	return session && (session.role === "ADMIN" || session.role === "LIBRARIAN") ? session : null;
}
