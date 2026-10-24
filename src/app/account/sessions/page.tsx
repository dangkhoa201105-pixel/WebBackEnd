/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, List, Space, Tag, Typography, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";

type LoginSession = {
	id: string;
	userAgent: string | null;
	ipAddress: string | null;
	createdAt: string;
	lastSeenAt: string;
	expiresAt: string;
	current: boolean;
};

export default function SessionsPage() {
	const router = useRouter();
	const [sessions, setSessions] = useState<LoginSession[]>([]);
	const [loading, setLoading] = useState(true);
	const [messageApi, contextHolder] = message.useMessage();

	const loadSessions = useCallback(async () => {
		try {
			const response = await fetch("/api/account/sessions");
			const result = await response.json();
			if (response.status === 401) {
				router.push("/login?next=%2Faccount%2Fsessions");
				return;
			}
			if (!response.ok) throw new Error(result.message ?? "Không thể tải phiên đăng nhập");
			setSessions(result.data);
		} catch (error) {
			messageApi.error(error instanceof Error ? error.message : "Không thể tải phiên đăng nhập");
		} finally {
			setLoading(false);
		}
	}, [messageApi, router]);

	useEffect(() => { void loadSessions(); }, [loadSessions]);

	const revokeSession = async (item: LoginSession) => {
		const response = await fetch(`/api/account/sessions/${item.id}`, { method: "DELETE" });
		const result = await response.json();
		if (!response.ok) {
			messageApi.error(result.message ?? "Không thể thu hồi phiên");
			return;
		}
		messageApi.success("Đã thu hồi phiên đăng nhập");
		if (item.current) {
			await fetch("/api/auth/logout", { method: "POST" });
			router.push("/login");
			return;
		}
		setSessions((current) => current.filter((session) => session.id !== item.id));
	};

	return <main style={{ maxWidth: 900, margin: "45px auto", padding: 24 }}>
		{contextHolder}
		<Link href="/account">← Tài khoản</Link>
		<Typography.Title level={2}>Phiên đăng nhập</Typography.Title>
		<Typography.Paragraph>Xem các thiết bị đang đăng nhập và thu hồi phiên bạn không nhận ra.</Typography.Paragraph>
		<Card loading={loading}>
			<List
				dataSource={sessions}
				locale={{ emptyText: "Không có phiên đăng nhập nào khác." }}
				renderItem={(item) => <List.Item
					actions={[<Button key="revoke" danger onClick={() => void revokeSession(item)}>Thu hồi</Button>]}
				>
					<List.Item.Meta
						title={<Space>{item.userAgent || "Trình duyệt không xác định"}{item.current && <Tag color="blue">Phiên hiện tại</Tag>}</Space>}
						description={`IP: ${item.ipAddress ?? "Không rõ"} · Đăng nhập: ${new Date(item.createdAt).toLocaleString("vi-VN")} · Hết hạn: ${new Date(item.expiresAt).toLocaleString("vi-VN")}`}
					/>
				</List.Item>}
			/>
		</Card>
	</main>;
}
