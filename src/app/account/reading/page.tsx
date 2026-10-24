/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Checkbox, InputNumber, List, Progress, Select, Space, Tag, Typography, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/books";

type Category = { id: string; name: string };
type ReadingProfile = { monthlyReadingGoal: number; preferredCategories: string[] };
type Recommendation = { id: string; title: string; author: string; pricePerDay: number; category: { name: string } };
type Insights = {
	monthlyReadingGoal: number;
	monthLoans: number;
	monthlyProgress: number;
	totalLoans: number;
	activeLoans: number;
	preferredCategories: Array<{ id: string; name: string; count: number }>;
	recommendations: Recommendation[];
};
type Notification = { id: string; title: string; message: string; type: string; readAt: string | null; createdAt: string };

export default function ReadingPage() {
	const router = useRouter();
	const [categories, setCategories] = useState<Category[]>([]);
	const [profile, setProfile] = useState<ReadingProfile>({ monthlyReadingGoal: 4, preferredCategories: [] });
	const [insights, setInsights] = useState<Insights | null>(null);
	const [notifications, setNotifications] = useState<Notification[]>([]);
	const [saving, setSaving] = useState(false);
	const [messageApi, contextHolder] = message.useMessage();

	const load = useCallback(async () => {
		try {
			const responses = await Promise.all([
				fetch("/api/reading/profile"),
				fetch("/api/reading/insights"),
				fetch("/api/notifications"),
			]);
			if (responses.some((response) => response.status === 401)) {
				router.push("/login?next=%2Faccount%2Freading");
				return;
			}
			const bodies = await Promise.all(responses.map((response) => response.json()));
			const failed = responses.findIndex((response) => !response.ok);
			if (failed >= 0) throw new Error(bodies[failed].message ?? "Không thể tải hồ sơ đọc sách");
			setCategories(bodies[0].categories);
			setProfile(bodies[0].profile);
			setInsights(bodies[1]);
			setNotifications(bodies[2].data);
		} catch (error) {
			messageApi.error(error instanceof Error ? error.message : "Không thể tải hồ sơ đọc sách");
		}
	}, [messageApi, router]);
	useEffect(() => { void load(); }, [load]);

	const saveProfile = async () => {
		setSaving(true);
		try {
			const response = await fetch("/api/reading/profile", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(profile),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message ?? "Không thể lưu mục tiêu");
			messageApi.success("Đã lưu mục tiêu và thể loại yêu thích");
			await load();
		} catch (error) {
			messageApi.error(error instanceof Error ? error.message : "Không thể lưu hồ sơ");
		} finally {
			setSaving(false);
		}
	};

	const markRead = async (notification: Notification) => {
		const response = await fetch(`/api/notifications/${notification.id}`, { method: "PATCH" });
		if (!response.ok) {
			messageApi.error("Không thể đánh dấu thông báo");
			return;
		}
		setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
	};

	return <main style={{ maxWidth: 1050, margin: "45px auto", padding: 24 }}>
		{contextHolder}
		<Space direction="vertical" size="large" style={{ width: "100%" }}>
			<div><Link href="/account">← Tài khoản</Link><Typography.Title level={2}>Hồ sơ đọc sách</Typography.Title></div>
			<RowCards insights={insights} />
			<Card title="Mục tiêu và sở thích">
				<Space direction="vertical" style={{ width: "100%" }}>
					<label>Mục tiêu mượn sách mỗi tháng</label>
					<InputNumber min={1} max={100} value={profile.monthlyReadingGoal} onChange={(value) => setProfile((current) => ({ ...current, monthlyReadingGoal: value ?? 1 }))} />
					<label>Thể loại yêu thích (tối đa 5)</label>
					<Select
						mode="multiple"
						value={profile.preferredCategories}
						onChange={(value: string[]) => setProfile((current) => ({ ...current, preferredCategories: value.slice(0, 5) }))}
						options={categories.map((category) => ({ value: category.id, label: category.name }))}
						style={{ width: "100%" }}
					/>
					<Button type="primary" loading={saving} onClick={() => void saveProfile()}>Lưu sở thích</Button>
				</Space>
			</Card>
			<Card title="Thể loại bạn thường đọc">
				<List dataSource={insights?.preferredCategories ?? []} locale={{ emptyText: "Mượn sách để bắt đầu thống kê thói quen đọc." }} renderItem={(item) => <List.Item>{item.name}<Tag>{item.count} lượt</Tag></List.Item>} />
			</Card>
			<Card title="Gợi ý sách dành cho bạn">
				<List dataSource={insights?.recommendations ?? []} locale={{ emptyText: "Chưa có gợi ý phù hợp." }} renderItem={(book) => <List.Item>
					<List.Item.Meta title={book.title} description={`${book.author} · ${book.category.name} · ${formatCurrency(book.pricePerDay)}/ngày`} />
				</List.Item>} />
			</Card>
			<Card title="Thông báo và nhắc hạn">
				<List dataSource={notifications} locale={{ emptyText: "Chưa có thông báo. Nhắc hạn mượn được cập nhật khi mở trang này." }} renderItem={(notification) => <List.Item
					actions={!notification.readAt ? [<Button key="read" type="link" onClick={() => void markRead(notification)}>Đánh dấu đã đọc</Button>] : []}
				>
					<List.Item.Meta title={<>{notification.title} {!notification.readAt && <Tag color="blue">Mới</Tag>}</>} description={`${notification.message} · ${new Date(notification.createdAt).toLocaleString("vi-VN")}`} />
				</List.Item>} />
			</Card>
			<Card><Checkbox checked disabled>Thống kê dựa trên lịch sử mượn; gợi ý mang tính tham khảo.</Checkbox></Card>
		</Space>
	</main>;
}

function RowCards({ insights }: { insights: Insights | null }) {
	return <Space wrap style={{ width: "100%" }}>
		<Card style={{ minWidth: 210 }}><Typography.Text type="secondary">Tiến độ tháng</Typography.Text><Progress type="circle" percent={insights?.monthlyProgress ?? 0} format={() => `${insights?.monthLoans ?? 0}/${insights?.monthlyReadingGoal ?? 0}`} /></Card>
		<Card style={{ minWidth: 150 }}><Typography.Text type="secondary">Tổng lượt mượn</Typography.Text><Typography.Title level={3}>{insights?.totalLoans ?? 0}</Typography.Title></Card>
		<Card style={{ minWidth: 150 }}><Typography.Text type="secondary">Đang mượn</Typography.Text><Typography.Title level={3}>{insights?.activeLoans ?? 0}</Typography.Title></Card>
	</Space>;
}
