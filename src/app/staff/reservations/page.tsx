/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Space, Table, Tag, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Reservation = {
	id: string;
	status: "WAITING" | "READY" | "FULFILLED" | "CANCELLED" | "EXPIRED";
	createdAt: string;
	readyUntil: string | null;
	queuePosition: number;
	book: { id: string; title: string };
	copy: { barcode: string } | null;
	user: { name: string; email: string };
};

export default function StaffReservationsPage() {
	const router = useRouter();
	const [data, setData] = useState<Reservation[]>([]);
	const [messageApi, contextHolder] = message.useMessage();
	const load = useCallback(async () => {
		const response = await fetch("/api/reservations?active=true");
		const result = await response.json();
		if (response.status === 401) {
			router.push("/login?next=%2Fstaff%2Freservations");
			return;
		}
		if (!response.ok) {
			messageApi.error(result.message ?? "Không thể tải hàng đợi");
			return;
		}
		setData(result);
	}, [messageApi, router]);
	useEffect(() => { void load(); }, [load]);

	return <main style={{ maxWidth: 1150, margin: "45px auto", padding: 24 }}>
		{contextHolder}
		<Link href="/staff">← Nghiệp vụ thư viện</Link>
		<h1>Hàng đợi đặt trước</h1>
		<Table rowKey="id" dataSource={data} columns={[
			{ title: "Vị trí", render: (_: unknown, item: Reservation) => item.status === "WAITING" ? item.queuePosition : "—" },
			{ title: "Độc giả", render: (_: unknown, item: Reservation) => `${item.user.name} · ${item.user.email}` },
			{ title: "Sách", dataIndex: ["book", "title"] },
			{ title: "Barcode", dataIndex: ["copy", "barcode"], render: (value: string | null) => value ?? "Chờ sách" },
			{ title: "Trạng thái", dataIndex: "status", render: (value: Reservation["status"]) => <Tag color={value === "READY" ? "green" : "blue"}>{value}</Tag> },
			{ title: "Hạn giữ", dataIndex: "readyUntil", render: (value: string | null) => value ? new Date(value).toLocaleString("vi-VN") : "—" },
			{ title: "Thao tác", render: (_: unknown, item: Reservation) => item.status === "WAITING" || item.status === "READY"
				? <Button danger size="small" onClick={async () => {
					const response = await fetch(`/api/reservations/${item.id}`, { method: "DELETE" });
					const result = await response.json();
					if (!response.ok) messageApi.error(result.message ?? "Không thể hủy");
					else { messageApi.success("Đã hủy yêu cầu"); await load(); }
				}}>Hủy yêu cầu</Button>
				: <Space>—</Space> },
		]} />
	</main>;
}
