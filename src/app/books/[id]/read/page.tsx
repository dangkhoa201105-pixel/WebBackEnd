/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Spin, Typography, message } from "antd";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type ReadingBook = {
	book: { id: string; title: string; author: string };
	content: string;
	accessType: "PURCHASE" | "RENTAL";
	expiresAt: string | null;
};

export default function BookReaderPage() {
	const router = useRouter();
	const params = useParams<{ id: string }>();
	const [book, setBook] = useState<ReadingBook | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [messageApi, contextHolder] = message.useMessage();

	const load = useCallback(async () => {
		try {
			const response = await fetch(`/api/books/${params.id}/read`, { cache: "no-store" });
			const result = await response.json();
			if (response.status === 401) {
				router.push(`/login?next=${encodeURIComponent(`/books/${params.id}/read`)}`);
				return;
			}
			if (!response.ok) {
				setBook(null);
				setError(result.message ?? "Không thể mở nội dung sách");
				return;
			}
			setBook(result);
			setError("");
		} catch {
			const errorMessage = "Không thể kết nối đến máy chủ";
			setError(errorMessage);
			messageApi.error(errorMessage);
		} finally {
			setLoading(false);
		}
	}, [messageApi, params.id, router]);

	useEffect(() => { void load(); }, [load]);
	useEffect(() => {
		const interval = window.setInterval(() => { void load(); }, 30_000);
		return () => window.clearInterval(interval);
	}, [load]);

	return <main style={{ maxWidth: 900, margin: "40px auto", padding: 24 }}>
		{contextHolder}
		<div style={{ marginBottom: 24 }}><Link href="/account/library">← Tủ sách online</Link></div>
		{loading ? <Card><Spin /> Đang tải nội dung sách...</Card>
			: error ? <Alert type="warning" showIcon message={error} action={<Button href="/account/library">Mở tủ sách</Button>} />
				: book && <Card>
					<Typography.Title level={2}>{book.book.title}</Typography.Title>
					<Typography.Paragraph type="secondary">{book.book.author}</Typography.Paragraph>
					<Alert
						type={book.accessType === "PURCHASE" ? "success" : "info"}
						showIcon
						message={book.accessType === "PURCHASE"
							? "Quyền đọc vô thời hạn — sách đã mua"
							: `Quyền đọc đến ${book.expiresAt ? new Date(book.expiresAt).toLocaleString("vi-VN") : "hạn trả"}`}
						style={{ marginBottom: 24 }}
					/>
					<Typography.Paragraph style={{ whiteSpace: "pre-wrap", lineHeight: 2, fontSize: 17 }}>
						{book.content}
					</Typography.Paragraph>
				</Card>}
	</main>;
}
