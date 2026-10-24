/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Select, Space, Table, message } from "antd";
import Link from "next/link";

type Role = "USER" | "LIBRARIAN" | "ADMIN";
type User = {
	id: string;
	name: string;
	email: string;
	phone: string;
	role: Role;
	status: "ACTIVE" | "LOCKED";
	_count: { rentals: number; orders: number };
};

export default function UsersPage() {
	const [users, setUsers] = useState<User[]>([]);
	const [q, setQ] = useState("");
	const [role, setRole] = useState("");
	const [status, setStatus] = useState("");
	const [messageApi, contextHolder] = message.useMessage();

	const load = useCallback(async () => {
		const params = new URLSearchParams({ q, role, status });
		const response = await fetch(`/api/admin/users?${params}`);
		if (!response.ok) {
			messageApi.error((await response.json()).message ?? "Không thể tải danh sách tài khoản");
			return;
		}
		setUsers(await response.json());
	}, [messageApi, q, role, status]);

	useEffect(() => {
		void load();
	}, [load]);

	const update = async (id: string, changes: { role?: Role; status?: "ACTIVE" | "LOCKED" }) => {
		const response = await fetch("/api/admin/users", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id, ...changes }),
		});
		if (!response.ok) messageApi.error((await response.json()).message ?? "Không thể cập nhật tài khoản");
		else {
			messageApi.success("Đã cập nhật tài khoản");
			await load();
		}
	};

	return <main style={{ maxWidth: 1150, margin: "45px auto", padding: 24 }}>
		{contextHolder}
		<Link href="/admin">← Dashboard</Link>
		<h1>Quản lý tài khoản</h1>
		<Space style={{ margin: "20px 0" }} wrap>
			<Input.Search placeholder="Tìm tên, email, số điện thoại" onSearch={setQ} style={{ width: 310 }} />
			<Select allowClear placeholder="Vai trò" onChange={(value) => setRole(value ?? "")} style={{ width: 150 }} options={[
				{ value: "USER", label: "Độc giả" },
				{ value: "LIBRARIAN", label: "Nhân viên thư viện" },
				{ value: "ADMIN", label: "Quản trị viên" },
			]} />
			<Select allowClear placeholder="Trạng thái" onChange={(value) => setStatus(value ?? "")} style={{ width: 130 }} options={[
				{ value: "ACTIVE", label: "Đang hoạt động" },
				{ value: "LOCKED", label: "Đã khóa" },
			]} />
		</Space>
		<Table rowKey="id" dataSource={users} columns={[
			{ title: "Họ tên", dataIndex: "name" },
			{ title: "Email", dataIndex: "email" },
			{ title: "Số điện thoại", dataIndex: "phone" },
			{ title: "Phiếu mượn", dataIndex: ["_count", "rentals"] },
			{ title: "Đơn mua", dataIndex: ["_count", "orders"] },
			{ title: "Vai trò", render: (_: unknown, user: User) => <Select size="small" value={user.role} onChange={(value: Role) => void update(user.id, { role: value })} options={[
				{ value: "USER", label: "Độc giả" },
				{ value: "LIBRARIAN", label: "Nhân viên" },
				{ value: "ADMIN", label: "Admin" },
			]} /> },
			{ title: "Trạng thái", render: (_: unknown, user: User) => <Button size="small" danger={user.status === "ACTIVE"} onClick={() => void update(user.id, { status: user.status === "ACTIVE" ? "LOCKED" : "ACTIVE" })}>
				{user.status === "ACTIVE" ? "Khóa" : "Mở khóa"}
			</Button> },
		]} />
	</main>;
}
