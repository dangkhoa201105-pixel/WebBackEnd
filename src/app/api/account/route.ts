import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const imageUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}).optional().or(z.literal(""));
const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(20),
  avatarUrl: imageUrlSchema,
  coverUrl: imageUrlSchema,
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { _count: { select: { rentals: true, orders: true } } },
  });
  if (!user) return NextResponse.json({ message: "Không tìm thấy tài khoản" }, { status: 404 });
  const [activeRentalCount, unpaidFines] = await Promise.all([
    prisma.rental.count({ where: { userId: user.id, status: "ACTIVE" } }),
    prisma.fine.aggregate({ where: { rental: { userId: user.id }, paidAt: null }, _sum: { amount: true } }),
  ]);
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatarUrl: user.avatarUrl,
    coverUrl: user.coverUrl,
    rentalCount: user._count.rentals,
    activeRentalCount,
    orderCount: user._count.orders,
    unpaidFineTotal: unpaidFines._sum.amount ?? 0,
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Dữ liệu hồ sơ không hợp lệ" }, { status: 400 });
  }
  const input = profileSchema.safeParse(body);
  if (!input.success) return NextResponse.json({ message: "Thông tin hồ sơ hoặc URL ảnh chưa hợp lệ" }, { status: 400 });
  const user = await prisma.user.update({ where: { id: session.userId }, data: { ...input.data, avatarUrl: input.data.avatarUrl || null, coverUrl: input.data.coverUrl || null } });
  return NextResponse.json({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, avatarUrl: user.avatarUrl, coverUrl: user.coverUrl });
}
