/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Space, Tag, Typography, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";

type LibraryBook = {
	id: string;
	title: string;
	author: string;
	coverUrl: string | null;
	hasDigitalContent: boolean;
	accessType: "PURCHASE" | "RENTAL";
	expiresAt: string | null;
};

export default function DigitalLibraryPage() {
	const router = useRouter();
	const [books, setBooks] = useState<LibraryBook[]>([]);
	const [loading, setLoading] = useState(true);
	const [messageApi, contextHolder] = message.useMessage();

	const load = useCallback(async () => {
		try {
			const response = await fetch("/api/reading/library", { cache: "no-store" });
			if (response.status === 401) {
				router.push("/login?next=%2Faccount%2Flibrary");
				return;
			}
			const result = await response.json();
			if (!response.ok) throw new Error(result.message ?? "Không thể tải tủ sách online");
			setBooks(result.data);
		} catch (error) {
			messageApi.error(error instanceof Error ? error.message : "Không thể tải tủ sách online");
		} finally {
			setLoading(false);
		}
	}, [messageApi, router]);

	useEffect(() => { void load(); }, [load]);

	return <main style={{ maxWidth: 1000, margin: "45px auto", padding: 24 }}>
		{contextHolder}
		<Space direction="vertical" size="large" style={{ width: "100%" }}>
			<div><Link href="/account">← Tài khoản</Link><Typography.Title level={2}>Tủ sách online</Typography.Title>
				<Typography.Paragraph type="secondary">Sách thuê chỉ đọc được đến hạn trả. Sách đã mua được đọc vô thời hạn sau khi đơn được thanh toán.</Typography.Paragraph>
			</div>
			{!loading && books.length === 0
				? <Card><Empty description="Bạn chưa có sách được cấp quyền đọc online" /></Card>
				: <Space direction="vertical" size="middle" style={{ width: "100%" }}>
					{books.map((book) => <Card key={book.id}>
						<Space align="center" style={{ width: "100%", justifyContent: "space-between" }} wrap>
							<div>
								<Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>{book.title}</Typography.Title>
								<Typography.Text type="secondary">{book.author}</Typography.Text>
								<div style={{ marginTop: 8 }}>
									{book.accessType === "PURCHASE"
										? <Tag color="green">Đã mua · đọc vô thời hạn</Tag>
										: <Tag color="blue">Đang thuê · hạn đọc {book.expiresAt ? new Date(book.expiresAt).toLocaleString("vi-VN") : ""}</Tag>}
									{!book.hasDigitalContent && <Tag color="orange">Nội dung ebook đang được bổ sung</Tag>}
								</div>
							</div>
							<Button type="primary" disabled={!book.hasDigitalContent} href={`/books/${book.id}/read`}>
								{book.hasDigitalContent ? "Đọc online" : "Chưa có nội dung"}
							</Button>
						</Space>
					</Card>)}
				</Space>}
		</Space>
	</main>;
}
