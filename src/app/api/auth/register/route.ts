import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().min(9).max(20),
  password: z.string().min(8).max(128),
});
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Dữ liệu đăng ký không hợp lệ" }, { status: 400 });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: "Thông tin đăng ký chưa hợp lệ" }, { status: 400 });
    const { name, email, phone, password } = parsed.data;
    const { user, loginSession } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { name, email, phone, passwordHash: await bcrypt.hash(password, 12) },
      });
      await writeAuditLog(tx, {
        actorId: createdUser.id,
        action: "auth.registered",
        entity: "user",
        entityId: createdUser.id,
      });
      const createdSession = await tx.loginSession.create({
        data: {
          userId: createdUser.id,
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || "unknown",
          userAgent: request.headers.get("user-agent")?.slice(0, 512),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      return { user: createdUser, loginSession: createdSession };
    });
    const response = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone } }, { status: 201 });
    response.cookies.set("booknest_token", await createToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion, sessionId: loginSession.id }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7, path: "/" });
    return response;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "Email đã được sử dụng" }, { status: 409 });
    }
    const prismaCode = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "UNKNOWN";
    console.error("Registration failed:", { code: prismaCode, error });
    return NextResponse.json({ message: "Không thể lưu tài khoản. Hãy kiểm tra PostgreSQL và DATABASE_URL." }, { status: 500 });
  }
}
