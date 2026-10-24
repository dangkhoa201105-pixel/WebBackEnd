"use client";

import { useEffect, useState } from "react";
import { Button, Card, Col, Row, Statistic, Table, Tag, Space, message } from "antd";
import Link from "next/link";

type Report = {
	userCount: number;
	bookCount: number;
	activeLoans: number;
	monthlyOrders: number;
	monthlyRevenue: number;
	unpaidFineTotal: number;
	activeReservations: number;
	damagedCopies: number;
	lowStockBooks: Array<{ id: string; title: string; stock: number; available: number; saleStock: number }>;
	topBorrowedBooks: Array<{ id?: string; title?: string; loans: number }>;
};
const currency = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);

export default function AdminPage() {
	const [report, setReport] = useState<Report | null>(null);
	const [messageApi, contextHolder] = message.useMessage();
	useEffect(() => {
		fetch("/api/admin/reports").then(async (response) => {
			const result = await response.json();
			if (!response.ok) throw new Error(result.message ?? "Không thể tải báo cáo");
			setReport(result);
		}).catch((error: unknown) => {
			messageApi.error(error instanceof Error ? error.message : "Không thể tải báo cáo");
		});
	}, [messageApi]);

	return <main style={{ maxWidth: 1120, margin: "50px auto", padding: 24 }}>
		{contextHolder}
		<h1>Admin Dashboard</h1>
		<p>Tổng quan nghiệp vụ thư viện và bán sách BookNest.</p>
		<Space style={{ marginTop: 18 }} wrap>
			<Link href="/admin/users"><Button>Quản lý tài khoản</Button></Link>
			<Link href="/admin/books"><Button type="primary">Quản lý sách</Button></Link>
			<Link href="/admin/inventory"><Button>Quản lý từng bản sách</Button></Link>
			<Link href="/admin/reservations"><Button>Hàng đợi đặt trước</Button></Link>
			<Link href="/admin/security"><Button>Trung tâm bảo mật</Button></Link>
			<Link href="/admin/audit-logs"><Button>Nhật ký bảo mật</Button></Link>
		</Space>
		<Row gutter={[16, 16]} style={{ marginTop: 30 }}>
			<Col xs={24} sm={12} lg={6}><Card><Statistic title="Tài khoản" value={report?.userCount ?? 0} loading={!report} /></Card></Col>
			<Col xs={24} sm={12} lg={6}><Card><Statistic title="Đầu sách" value={report?.bookCount ?? 0} loading={!report} /></Card></Col>
			<Col xs={24} sm={12} lg={6}><Card><Statistic title="Phiếu đang mượn" value={report?.activeLoans ?? 0} loading={!report} /></Card></Col>
			<Col xs={24} sm={12} lg={6}><Card><Statistic title="Doanh thu tháng" value={report?.monthlyRevenue ?? 0} formatter={(value) => currency(Number(value))} loading={!report} /></Card></Col>
		</Row>
		<Row gutter={[16, 16]} style={{ marginTop: 16 }}>
			<Col xs={24} sm={12}><Card><Statistic title="Đơn mua trong tháng" value={report?.monthlyOrders ?? 0} loading={!report} /></Card></Col>
			<Col xs={24} sm={12}><Card><Statistic title="Tiền phạt chưa thu" value={report?.unpaidFineTotal ?? 0} formatter={(value) => currency(Number(value))} loading={!report} /></Card></Col>
			<Col xs={24} sm={12}><Card><Statistic title="Đặt trước đang mở" value={report?.activeReservations ?? 0} loading={!report} /></Card></Col>
			<Col xs={24} sm={12}><Card><Statistic title="Bản hỏng/bảo trì" value={report?.damagedCopies ?? 0} loading={!report} /></Card></Col>
		</Row>
		<Card title="Sách được mượn nhiều nhất" style={{ marginTop: 24 }}>
			<Table rowKey={(book) => book.id ?? book.title ?? ""} pagination={false} loading={!report} dataSource={report?.topBorrowedBooks ?? []} columns={[
				{ title: "Sách", dataIndex: "title" },
				{ title: "Lượt mượn", dataIndex: "loans" },
			]} />
		</Card>
		<Card title="Sách sắp hết bản cho mượn" style={{ marginTop: 24 }}>
			<Table rowKey="id" pagination={false} loading={!report} dataSource={report?.lowStockBooks ?? []} columns={[
				{ title: "Sách", dataIndex: "title" },
				{ title: "Bản thư viện", render: (_: unknown, book: Report["lowStockBooks"][number]) => `${book.available} / ${book.stock}` },
				{ title: "Tồn bán", dataIndex: "saleStock" },
				{ title: "Trạng thái", render: (_: unknown, book: Report["lowStockBooks"][number]) => <Tag color={book.available === 0 ? "red" : "orange"}>{book.available === 0 ? "Hết bản mượn" : "Sắp hết"}</Tag> },
			]} />
		</Card>
	</main>;
}
