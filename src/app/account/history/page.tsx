/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Space, Table, Tabs, Tag, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Loan = {
	id: string;
	startDate: string;
	dueDate: string;
	status: "PENDING" | "ACTIVE" | "RETURNED" | "CANCELLED" | "EXPIRED";
	rentalMode: "ONLINE" | "OFFLINE";
	total: number;
	amountPaid: number;
	refundableDeposit: number;
	refundedAmount: number;
	paidAt: string | null;
	refundedAt: string | null;
	depositForfeitedAt: string | null;
	extendedCount: number;
	book: { id: string; title: string };
	fine: { amount: number; paidAt: string | null } | null;
};
type Order = {
	id: string;
	createdAt: string;
	status: "CONFIRMED" | "CANCELLED" | "EXPIRED";
	paymentMethod: "CASH" | "SIMULATED" | "PAYOS";
	paymentStatus: "PENDING" | "PAID";
	total: number;
	items: Array<{ title: string; quantity: number; subtotal: number }>;
};
type Fine = { id: string; amount: number; reason: string; paidAt: string | null; rental: { book: { title: string } } };
const currency = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
const date = (value: string) => new Date(value).toLocaleDateString("vi-VN");

export default function AccountHistoryPage() {
	const router = useRouter();
	const [loans, setLoans] = useState<Loan[]>([]);
	const [orders, setOrders] = useState<Order[]>([]);
	const [fines, setFines] = useState<Fine[]>([]);
	const [loading, setLoading] = useState(true);
	const [checkingOrderId, setCheckingOrderId] = useState<string | null>(null);
	const [messageApi, contextHolder] = message.useMessage();

	const load = useCallback(async () => {
		try {
			const responses = await Promise.all([
				fetch("/api/loans?limit=50"),
				fetch("/api/orders/my?limit=50"),
				fetch("/api/fines/my?limit=50"),
			]);
			if (responses.some((response) => response.status === 401)) {
				router.push("/login?next=%2Faccount%2Fhistory");
				return;
			}
			const bodies = await Promise.all(responses.map((response) => response.json()));
			const failed = responses.findIndex((response) => !response.ok);
			if (failed >= 0) throw new Error(bodies[failed].message ?? "Không thể tải lịch sử giao dịch");
			setLoans(bodies[0].data);
			setOrders(bodies[1].data);
			setFines(bodies[2].data);
		} catch (error) {
			messageApi.error(error instanceof Error ? error.message : "Không thể tải lịch sử giao dịch");
		} finally {
			setLoading(false);
		}
	}, [messageApi, router]);
	useEffect(() => { void load(); }, [load]);

	const act = async (url: string, body?: object) => {
		const response = await fetch(url, {
			method: body ? "POST" : "PATCH",
			...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
		});
		const result = await response.json();
		if (!response.ok) {
			messageApi.error(result.message ?? "Không thể cập nhật giao dịch");
			return;
		}
		messageApi.success("Đã cập nhật giao dịch");
		await load();
	};

	const startPayosCheckout = async (orderId: string) => {
		setCheckingOrderId(orderId);
		try {
			const response = await fetch(`/api/orders/${orderId}/checkout`, { method: "POST" });
			const result = await response.json();
			if (!response.ok) throw new Error(result.message ?? "Không thể tạo link thanh toán");
			if (typeof result.checkoutUrl !== "string") throw new Error("PayOS chưa trả về link thanh toán hợp lệ");
			window.location.assign(result.checkoutUrl);
		} catch (error) {
			messageApi.error(error instanceof Error ? error.message : "Không thể tạo link thanh toán");
		} finally {
			setCheckingOrderId(null);
		}
	};

	return <main style={{ maxWidth: 1100, margin: "45px auto", padding: 24 }}>
		{contextHolder}
		<Space direction="vertical" size="large" style={{ width: "100%" }}>
			<div><Link href="/account">← Tài khoản</Link><h1>Lịch sử giao dịch</h1></div>
			<Tabs items={[
				{ key: "loans", label: `Mượn sách (${loans.length})`, children: <Table rowKey="id" loading={loading} dataSource={loans} columns={[
					{ title: "Sách", dataIndex: ["book", "title"] },
					{ title: "Hình thức", render: (_: unknown, loan: Loan) => <Tag color={loan.rentalMode === "ONLINE" ? "green" : "blue"}>{loan.rentalMode === "ONLINE" ? "Online" : "Offline"}</Tag> },
					{ title: "Ngày mượn", dataIndex: "startDate", render: date },
					{ title: "Hạn trả", dataIndex: "dueDate", render: date },
					{ title: "Trạng thái", dataIndex: "status", render: (value: Loan["status"]) => <Tag color={value === "ACTIVE" ? "blue" : value === "EXPIRED" ? "red" : "default"}>{value === "EXPIRED" ? "Hết hạn" : value}</Tag> },
					{ title: "Tiền thuê / cọc", render: (_: unknown, loan: Loan) => <span>
						Phí thuê: {currency(loan.total)}<br />
						Đã thu mô phỏng: {currency(loan.amountPaid)}<br />
						{loan.refundableDeposit > 0 && `Hoàn: ${currency(loan.refundedAmount)}${loan.depositForfeitedAt ? " · Mất cọc" : loan.refundedAt ? " · Đã hoàn mô phỏng" : " · Chờ trả sách"}`}
					</span> },
					{ title: "Thao tác", render: (_: unknown, loan: Loan) => loan.rentalMode === "ONLINE" && loan.status === "ACTIVE"
						? <Button size="small" type="primary" href={`/books/${loan.book.id}/read`}>Đọc online</Button>
						: loan.rentalMode === "OFFLINE" && loan.status === "ACTIVE"
							? "Mang sách đến quầy để nhân viên ghi nhận trả"
							: "—" },
				]} /> },
				{ key: "orders", label: `Đơn mua (${orders.length})`, children: <Table rowKey="id" loading={loading} dataSource={orders} columns={[
					{ title: "Mã đơn", dataIndex: "id" },
					{ title: "Ngày đặt", dataIndex: "createdAt", render: date },
					{ title: "Sách", dataIndex: "items", render: (items: Order["items"]) => items.map((item) => `${item.title} × ${item.quantity}`).join(", ") },
					{ title: "Thanh toán", render: (_: unknown, order: Order) => order.paymentMethod === "SIMULATED" ? "Mô phỏng" : order.paymentMethod === "PAYOS" ? "PayOS" : "Tiền mặt" },
					{ title: "Trạng thái", render: (_: unknown, order: Order) => <Tag color={order.status === "EXPIRED" ? "red" : order.paymentStatus === "PAID" ? "green" : "orange"}>{order.status === "EXPIRED" ? "Hết hạn" : order.paymentStatus === "PAID" ? "Đã thanh toán" : "Chờ thanh toán"}</Tag> },
					{ title: "Tổng", dataIndex: "total", render: currency },
					{ title: "Thao tác", render: (_: unknown, order: Order) => order.status === "CONFIRMED" && order.paymentStatus === "PENDING"
						? order.paymentMethod === "PAYOS"
							? <Button size="small" type="primary" loading={checkingOrderId === order.id} onClick={() => void startPayosCheckout(order.id)}>Thanh toán PayOS</Button>
							: order.paymentMethod === "CASH"
								? <Button size="small" danger onClick={() => void act(`/api/orders/${order.id}`)}>Hủy đơn</Button>
								: "—"
						: "—" },
				]} /> },
				{ key: "fines", label: `Tiền phạt (${fines.length})`, children: <Table rowKey="id" loading={loading} dataSource={fines} columns={[
					{ title: "Sách", dataIndex: ["rental", "book", "title"] },
					{ title: "Lý do", dataIndex: "reason" },
					{ title: "Số tiền", dataIndex: "amount", render: currency },
					{ title: "Trạng thái", dataIndex: "paidAt", render: (value: string | null) => <Tag color={value ? "green" : "red"}>{value ? "Đã thanh toán" : "Chưa thanh toán"}</Tag> },
				]} /> },
			]} />
			<Card><p>Phí trễ hạn và phí hư hỏng/mất sách được nhân viên xác nhận theo quy định thư viện.</p></Card>
		</Space>
	</main>;
}
