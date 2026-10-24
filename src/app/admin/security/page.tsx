/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Col, Row, Select, Space, Table, Tag, message } from "antd";
import Link from "next/link";

type Alert = {
	id: string;
	type: string;
	severity: string;
	status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
	description: string;
	createdAt: string;
	user: { name: string; email: string } | null;
};
type SensitiveChange = { id: string; action: string; createdAt: string; actor: { name: string; email: string } | null };
type SecurityData = { data: Alert[]; counts: Array<{ status: string; _count: { id: number } }>; failedLoginsLast24Hours: number; sensitiveChanges: SensitiveChange[] };

export default function SecurityPage() {
	const [result, setResult] = useState<SecurityData | null>(null);
	const [status, setStatus] = useState("");
	const [messageApi, contextHolder] = message.useMessage();
	const load = useCallback(async () => {
		const response = await fetch(`/api/admin/security/alerts${status ? `?status=${status}` : ""}`);
		const body = await response.json();
		if (!response.ok) {
			messageApi.error(body.message ?? "Không thể tải trung tâm bảo mật");
			return;
		}
		setResult(body);
	}, [messageApi, status]);
	useEffect(() => { void load(); }, [load]);

	const updateAlert = async (id: string, nextStatus: "ACKNOWLEDGED" | "RESOLVED") => {
		const response = await fetch("/api/admin/security/alerts", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id, status: nextStatus }),
		});
		const body = await response.json();
		if (!response.ok) messageApi.error(body.message ?? "Không thể cập nhật cảnh báo");
		else { messageApi.success("Đã cập nhật cảnh báo"); await load(); }
	};

	return <main style={{ maxWidth: 1200, margin: "45px auto", padding: 24 }}>
		{contextHolder}
		<Link href="/admin">← Dashboard</Link>
		<h1>Trung tâm bảo mật</h1>
		<Row gutter={[16, 16]} style={{ margin: "20px 0" }}>
			<Col xs={24} sm={12}><Card title="Đăng nhập thất bại trong 24 giờ">{result?.failedLoginsLast24Hours ?? "—"}</Card></Col>
			{(result?.counts ?? []).map((count) => <Col xs={12} sm={6} key={count.status}><Card title={`Cảnh báo ${count.status}`}>{count._count.id}</Card></Col>)}
		</Row>
		<Space style={{ marginBottom: 16 }}><span>Trạng thái cảnh báo</span><Select allowClear value={status || undefined} onChange={(value) => setStatus(value ?? "")} options={[
			{ value: "OPEN", label: "Mới" },
			{ value: "ACKNOWLEDGED", label: "Đã tiếp nhận" },
			{ value: "RESOLVED", label: "Đã xử lý" },
		]} style={{ width: 170 }} /></Space>
		<Card title="Cảnh báo tự động">
			<Table rowKey="id" dataSource={result?.data ?? []} columns={[
				{ title: "Thời điểm", dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString("vi-VN") },
				{ title: "Loại", dataIndex: "type" },
				{ title: "Mức độ", dataIndex: "severity", render: (value: string) => <Tag color={value === "HIGH" || value === "CRITICAL" ? "red" : "orange"}>{value}</Tag> },
				{ title: "Tài khoản", render: (_: unknown, alert: Alert) => alert.user ? `${alert.user.name} (${alert.user.email})` : "—" },
				{ title: "Chi tiết", dataIndex: "description" },
				{ title: "Trạng thái", dataIndex: "status" },
				{ title: "Cập nhật", render: (_: unknown, alert: Alert) => alert.status === "OPEN" ? <Button onClick={() => void updateAlert(alert.id, "ACKNOWLEDGED")}>Tiếp nhận</Button>
					: alert.status === "ACKNOWLEDGED" ? <Button type="primary" onClick={() => void updateAlert(alert.id, "RESOLVED")}>Đánh dấu xử lý</Button> : "—" },
			]} />
		</Card>
		<Card title="Thay đổi nhạy cảm trong 24 giờ" style={{ marginTop: 20 }}>
			<Table rowKey="id" dataSource={result?.sensitiveChanges ?? []} columns={[
				{ title: "Thời điểm", dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString("vi-VN") },
				{ title: "Thao tác", dataIndex: "action" },
				{ title: "Người thực hiện", render: (_: unknown, row: SensitiveChange) => row.actor ? `${row.actor.name} (${row.actor.email})` : "—" },
			]} />
		</Card>
	</main>;
}
