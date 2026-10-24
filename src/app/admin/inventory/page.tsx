/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, InputNumber, Select, Space, Table, Tag, Typography, message } from "antd";
import Link from "next/link";

type BookOption = { id: string; title: string };
type Copy = {
	id: string;
	barcode: string;
	status: "AVAILABLE" | "ON_LOAN" | "RESERVED" | "DAMAGED" | "LOST" | "MAINTENANCE" | "DISPOSED";
	condition: string;
	notes: string | null;
	rentals: Array<{ id: string; dueDate: string; user: { name: string } }>;
};
type Movement = {
	id: string;
	type: string;
	quantity: number;
	notes: string | null;
	createdAt: string;
	book: { title: string };
	copy: { barcode: string } | null;
	actor: { name: string } | null;
};
const states: Array<{ value: Copy["status"]; label: string }> = [
	{ value: "AVAILABLE", label: "Sẵn sàng" },
	{ value: "ON_LOAN", label: "Đang mượn" },
	{ value: "RESERVED", label: "Đã giữ" },
	{ value: "DAMAGED", label: "Hư hỏng" },
	{ value: "LOST", label: "Thất lạc" },
	{ value: "MAINTENANCE", label: "Đang bảo trì" },
	{ value: "DISPOSED", label: "Đã thanh lý" },
];

export default function InventoryPage() {
	const [books, setBooks] = useState<BookOption[]>([]);
	const [bookId, setBookId] = useState("");
	const [copies, setCopies] = useState<Copy[]>([]);
	const [movements, setMovements] = useState<Movement[]>([]);
	const [count, setCount] = useState<number | null>(1);
	const [loading, setLoading] = useState(false);
	const [messageApi, contextHolder] = message.useMessage();

	const loadBooks = useCallback(async () => {
		const response = await fetch("/api/staff/books");
		if (!response.ok) {
			messageApi.error((await response.json()).message ?? "Không thể tải danh sách sách");
			return;
		}
		const result = await response.json() as Array<BookOption>;
		setBooks(result);
		if (result.length && !bookId) setBookId(result[0].id);
	}, [bookId, messageApi]);

	const loadInventory = useCallback(async () => {
		if (!bookId) return;
		setLoading(true);
		try {
			const [copyResponse, movementResponse] = await Promise.all([
				fetch(`/api/admin/books/${bookId}/copies`),
				fetch(`/api/admin/inventory/movements?bookId=${encodeURIComponent(bookId)}&limit=30`),
			]);
			const copyResult = await copyResponse.json();
			const movementResult = await movementResponse.json();
			if (!copyResponse.ok) throw new Error(copyResult.message ?? "Không thể tải bản sách");
			if (!movementResponse.ok) throw new Error(movementResult.message ?? "Không thể tải lịch sử kho");
			setCopies(copyResult);
			setMovements(movementResult.data);
		} catch (error) {
			messageApi.error(error instanceof Error ? error.message : "Không thể tải tồn kho");
		} finally {
			setLoading(false);
		}
	}, [bookId, messageApi]);

	useEffect(() => { void loadBooks(); }, [loadBooks]);
	useEffect(() => { void loadInventory(); }, [loadInventory]);

	const addCopies = async () => {
		if (!bookId || !count) return;
		const response = await fetch(`/api/admin/books/${bookId}/copies`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ count }),
		});
		const result = await response.json();
		if (!response.ok) {
			messageApi.error(result.message ?? "Không thể nhập bản sách");
			return;
		}
		messageApi.success(`Đã nhập thêm ${result.length} bản`);
		await Promise.all([loadInventory(), loadBooks()]);
	};

	const changeCopy = async (copy: Copy, status: Copy["status"]) => {
		const response = await fetch(`/api/admin/copies/${copy.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status, notes: copy.notes }),
		});
		const result = await response.json();
		if (!response.ok) {
			messageApi.error(result.message ?? "Không thể đổi tình trạng bản sách");
			return;
		}
		messageApi.success("Đã cập nhật tình trạng và ghi nhận lịch sử kho");
		await loadInventory();
	};

	return <main style={{ maxWidth: 1200, margin: "45px auto", padding: 24 }}>
		{contextHolder}
		<Space direction="vertical" size="large" style={{ width: "100%" }}>
			<div><Link href="/admin">← Dashboard</Link><Typography.Title level={2}>Kho và vòng đời bản sách</Typography.Title></div>
			<Card title="Chọn đầu sách và nhập kho">
				<Space wrap>
					<Select
						showSearch
						optionFilterProp="label"
						value={bookId || undefined}
						onChange={setBookId}
						placeholder="Chọn sách"
						style={{ width: 320 }}
						options={books.map((book) => ({ value: book.id, label: book.title }))}
					/>
					<InputNumber min={1} max={100} value={count} onChange={setCount} />
					<Button type="primary" onClick={() => void addCopies()} disabled={!bookId || !count}>Nhập bản sách</Button>
				</Space>
			</Card>
			<Card title={`Mã bản sách (${copies.length})`}>
				<Table rowKey="id" loading={loading} dataSource={copies} pagination={{ pageSize: 10 }} columns={[
					{ title: "Barcode", dataIndex: "barcode" },
					{ title: "Trạng thái", dataIndex: "status", render: (value: Copy["status"]) => <Tag color={value === "AVAILABLE" ? "green" : value === "DAMAGED" || value === "LOST" ? "red" : "blue"}>{states.find((item) => item.value === value)?.label}</Tag> },
					{ title: "Độc giả / hạn trả", render: (_: unknown, copy: Copy) => copy.rentals[0] ? `${copy.rentals[0].user.name} · ${new Date(copy.rentals[0].dueDate).toLocaleDateString("vi-VN")}` : "—" },
					{ title: "Tình trạng / ghi chú", render: (_: unknown, copy: Copy) => copy.notes ?? copy.condition },
					{ title: "Cập nhật trạng thái", render: (_: unknown, copy: Copy) => <Select
						size="small"
						value={copy.status}
						disabled={copy.status === "ON_LOAN" || copy.status === "RESERVED" || copy.status === "LOST" || copy.status === "DISPOSED"}
						onChange={(value: Copy["status"]) => void changeCopy(copy, value)}
						options={states.filter((item) => copy.status === "AVAILABLE"
							? ["AVAILABLE", "DAMAGED", "MAINTENANCE", "DISPOSED"].includes(item.value)
							: copy.status === "DAMAGED" || copy.status === "MAINTENANCE"
								? ["AVAILABLE", "DAMAGED", "MAINTENANCE", "DISPOSED"].includes(item.value)
								: item.value === copy.status)}
					/> },
				]} />
			</Card>
			<Card title="Lịch sử nhập, mượn, trả và bảo trì">
				<Table rowKey="id" loading={loading} dataSource={movements} pagination={{ pageSize: 10 }} columns={[
					{ title: "Thời điểm", dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString("vi-VN") },
					{ title: "Thao tác", dataIndex: "type" },
					{ title: "Barcode", dataIndex: ["copy", "barcode"], render: (value: string | null) => value ?? "—" },
					{ title: "Thay đổi", dataIndex: "quantity" },
					{ title: "Người thực hiện", dataIndex: ["actor", "name"], render: (value: string | null) => value ?? "Seed/hệ thống" },
					{ title: "Ghi chú", dataIndex: "notes" },
				]} />
			</Card>
		</Space>
	</main>;
}
