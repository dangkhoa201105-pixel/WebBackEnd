/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Space, Table, Tag, message } from "antd";
import Link from "next/link";

type AuditEntry = {
	id: string;
	action: string;
	entity: string;
	entityId: string | null;
	metadata: unknown;
	createdAt: string;
	actor: { id: string; name: string; email: string } | null;
};
type AuditResponse = { data: AuditEntry[]; meta: { page: number; limit: number; total: number } };

export default function AuditLogsPage() {
	const [result, setResult] = useState<AuditResponse | null>(null);
	const [page, setPage] = useState(1);
	const [messageApi, contextHolder] = message.useMessage();
	const load = useCallback(async () => {
		try {
			const response = await fetch(`/api/admin/audit-logs?page=${page}&limit=50`);
			const body = await response.json();
			if (!response.ok) throw new Error(body.message ?? "Không thể tải audit log");
			setResult(body);
		} catch (error) {
			messageApi.error(error instanceof Error ? error.message : "Không thể tải audit log");
		}
	}, [messageApi, page]);
	useEffect(() => { void load(); }, [load]);

	return <main style={{ maxWidth: 1200, margin: "45px auto", padding: 24 }}>
		{contextHolder}
		<Link href="/admin">← Dashboard</Link>
		<h1>Nhật ký bảo mật</h1>
		<Table
			rowKey="id"
			loading={!result}
			dataSource={result?.data ?? []}
			pagination={false}
			columns={[
				{ title: "Thời điểm", dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString("vi-VN") },
				{ title: "Người thực hiện", render: (_: unknown, row: AuditEntry) => row.actor ? `${row.actor.name} (${row.actor.email})` : "Hệ thống/không xác thực" },
				{ title: "Hành động", dataIndex: "action", render: (value: string) => <Tag>{value}</Tag> },
				{ title: "Đối tượng", render: (_: unknown, row: AuditEntry) => `${row.entity}${row.entityId ? ` · ${row.entityId}` : ""}` },
				{ title: "Chi tiết", render: (_: unknown, row: AuditEntry) => row.metadata ? JSON.stringify(row.metadata) : "—" },
			]}
		/>
		<Space style={{ marginTop: 16 }}>
			<Button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Trước</Button>
			<span>Trang {page} / {Math.max(1, Math.ceil((result?.meta.total ?? 0) / 50))}</span>
			<Button disabled={!result || page * 50 >= result.meta.total} onClick={() => setPage((current) => current + 1)}>Sau</Button>
		</Space>
	</main>;
}
