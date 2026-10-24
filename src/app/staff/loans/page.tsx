/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Select, Space, Table, Tag, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Loan = {
	id: string;
	status: "ACTIVE" | "RETURNED" | "CANCELLED" | "EXPIRED" | "PENDING";
	rentalMode: "ONLINE" | "OFFLINE";
	startDate: string;
	dueDate: string;
	total: number;
	amountPaid: number;
	refundableDeposit: number;
	refundedAmount: number;
	depositForfeitedAt: string | null;
	book: { title: string };
	user: { name: string; email: string };
};

const currency = (amount: number) => new Intl.NumberFormat("vi-VN", {
	style: "currency",
	currency: "VND",
	maximumFractionDigits: 0,
}).format(amount);

export default function StaffLoansPage() {
	const router = useRouter();
	const [loans, setLoans] = useState<Loan[]>([]);
	const [conditions, setConditions] = useState<Record<string, "GOOD" | "DAMAGED" | "LOST">>({});
	const [loading, setLoading] = useState(true);
	const [returningId, setReturningId] = useState<string | null>(null);
	const [messageApi, contextHolder] = message.useMessage();

	const load = useCallback(async () => {
		try {
			const response = await fetch("/api/loans?limit=50&status=ACTIVE", { cache: "no-store" });
			const result = await response.json();
			if (response.status === 401 || response.status === 403) {
				router.push("/login?next=%2Fstaff%2Floans");
				return;
			}
			if (!response.ok) throw new Error(result.message ?? "Không thể tải phiếu thuê");
			setLoans(result.data);
		} catch (error) {
			messageApi.error(error instanceof Error ? error.message : "Không thể tải phiếu thuê");
		} finally {
			setLoading(false);
		}
	}, [messageApi, router]);

	useEffect(() => { void load(); }, [load]);

	const returnLoan = async (loan: Loan) => {
		setReturningId(loan.id);
		try {
			const response = await fetch(`/api/loans/${loan.id}/return`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ condition: conditions[loan.id] ?? "GOOD" }),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message ?? "Không thể ghi nhận trả sách");
			messageApi.success(result.refundAmount > 0
				? `Đã ghi nhận trả sách và hoàn mô phỏng ${currency(result.refundAmount)}.`
				: loan.refundableDeposit > 0
					? "Đã ghi nhận trả sách quá hạn; khoản cọc không được hoàn."
					: "Đã ghi nhận trả sách.");
			await load();
		} catch (error) {
			messageApi.error(error instanceof Error ? error.message : "Không thể ghi nhận trả sách");
		} finally {
			setReturningId(null);
		}
	};

	return <main style={{ maxWidth: 1200, margin: "40px auto", padding: 24 }}>
		{contextHolder}
		<Link href="/staff">← Khu vực nhân viên</Link>
		<h1>Phiếu thuê đang hoạt động</h1>
		<p>Thuê offline 7 ngày: xác nhận tình trạng bản sách khi khách trả. Trả đúng hạn hoàn mô phỏng 40% tiền cọc; trả trễ không hoàn cọc.</p>
		<Table
			rowKey="id"
			loading={loading}
			dataSource={loans}
			scroll={{ x: 1050 }}
			columns={[
				{ title: "Độc giả", render: (_: unknown, loan: Loan) => <>{loan.user.name}<br /><small>{loan.user.email}</small></> },
				{ title: "Sách", dataIndex: ["book", "title"] },
				{ title: "Hình thức", render: (_: unknown, loan: Loan) => <Tag color={loan.rentalMode === "ONLINE" ? "green" : "blue"}>{loan.rentalMode}</Tag> },
				{ title: "Hạn", dataIndex: "dueDate", render: (value: string) => new Date(value).toLocaleString("vi-VN") },
				{ title: "Thu/đã cọc", dataIndex: "amountPaid", render: currency },
				{ title: "Hoàn nếu đúng hạn", render: (_: unknown, loan: Loan) => currency(Math.round(loan.refundableDeposit * 0.4)) },
				{ title: "Tình trạng / trả", render: (_: unknown, loan: Loan) => loan.rentalMode === "OFFLINE"
					? <Space direction="vertical">
						<Select
							value={conditions[loan.id] ?? "GOOD"}
							onChange={(value: "GOOD" | "DAMAGED" | "LOST") => setConditions((current) => ({ ...current, [loan.id]: value }))}
							options={[
								{ value: "GOOD", label: "Tốt" },
								{ value: "DAMAGED", label: "Hư hỏng" },
								{ value: "LOST", label: "Thất lạc" },
							]}
							style={{ width: 140 }}
						/>
						<Button type="primary" loading={returningId === loan.id} onClick={() => void returnLoan(loan)}>Xác nhận trả</Button>
					</Space>
					: "Thuê online tự hết hạn" },
			]}
		/>
	</main>;
}
