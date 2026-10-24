/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Modal, Space, Table, Tag, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Reservation = {
	id: string;
	status: "WAITING" | "READY" | "FULFILLED" | "CANCELLED" | "EXPIRED";
	createdAt: string;
	readyUntil: string | null;
	queuePosition: number;
	book: { title: string; author: string; salePrice: number };
	copy: { barcode: string } | null;
};

export default function ReservationsPage() {
	const router = useRouter();
	const [reservations, setReservations] = useState<Reservation[]>([]);
	const [loading, setLoading] = useState(true);
	const [reservationToClaim, setReservationToClaim] = useState<Reservation | null>(null);
	const [claiming, setClaiming] = useState(false);
	const [messageApi, contextHolder] = message.useMessage();
	const load = useCallback(async () => {
		try {
			const response = await fetch("/api/reservations");
			const result = await response.json();
			if (response.status === 401) {
				router.push("/login?next=%2Faccount%2Freservations");
				return;
			}
			if (!response.ok) throw new Error(result.message ?? "Không thể tải hàng đợi");
			setReservations(result);
		} catch (error) {
			messageApi.error(error instanceof Error ? error.message : "Không thể tải hàng đợi");
		} finally {
			setLoading(false);
		}
	}, [messageApi, router]);
	useEffect(() => { void load(); }, [load]);

	const cancel = async (id: string) => {
		const response = await fetch(`/api/reservations/${id}`, { method: "DELETE" });
		const result = await response.json();
		if (!response.ok) {
			messageApi.error(result.message ?? "Không thể hủy đặt trước");
			return;
		}
		messageApi.success("Đã hủy đặt trước");
		await load();
	};

	const claim = async () => {
		if (!reservationToClaim) return;
		setClaiming(true);
		try {
			const response = await fetch(`/api/reservations/${reservationToClaim.id}/claim`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ days: 7 }),
			});
			const result = await response.json();
			if (!response.ok) {
				messageApi.error(result.message ?? "Không thể xác nhận mượn");
				await load();
				return;
			}
			messageApi.success("Đã tạo phiếu thuê sách giấy (thanh toán mô phỏng).");
			router.push("/account/history");
		} catch {
			messageApi.error("Không thể kết nối đến máy chủ. Hãy kiểm tra lịch sử thuê trước khi thử lại.");
		} finally {
			setClaiming(false);
			setReservationToClaim(null);
		}
	};

	return <main style={{ maxWidth: 1050, margin: "45px auto", padding: 24 }}>
		{contextHolder}
		<Link href="/account">← Tài khoản</Link>
		<h1>Đặt trước và hàng đợi sách</h1>
		<p>Sách sẵn sàng được giữ trong 48 giờ. Xác nhận nhận sách tạo lượt thuê offline 7 ngày: thu/cọc mô phỏng 100% giá sách, hoàn 40% nếu trả đúng hạn.</p>
		<Table rowKey="id" loading={loading} dataSource={reservations} columns={[
			{ title: "Sách", render: (_: unknown, reservation: Reservation) => <>{reservation.book.title}<br /><small>{reservation.book.author}</small></> },
			{ title: "Vị trí", render: (_: unknown, reservation: Reservation) => reservation.status === "WAITING"
				? `Đang chờ: ${reservation.queuePosition}`
				: reservation.copy?.barcode ?? "—" },
			{ title: "Trạng thái", dataIndex: "status", render: (value: Reservation["status"]) => <Tag color={value === "READY" ? "green" : value === "WAITING" ? "blue" : "default"}>{value}</Tag> },
			{ title: "Hạn nhận", dataIndex: "readyUntil", render: (value: string | null) => value ? new Date(value).toLocaleString("vi-VN") : "—" },
			{ title: "Thao tác", render: (_: unknown, reservation: Reservation) => <Space>
				{reservation.status === "READY" && <Button type="primary" onClick={() => setReservationToClaim(reservation)}>Nhận sách · đặt cọc 100%</Button>}
				{(reservation.status === "READY" || reservation.status === "WAITING") && <Button danger onClick={() => void cancel(reservation.id)}>Hủy</Button>}
			</Space> },
		]} />
		<Modal
			title="Xác nhận thuê sách giấy"
			open={reservationToClaim !== null}
			confirmLoading={claiming}
			okText="Xác nhận cọc mô phỏng"
			cancelText="Quay lại"
			onCancel={() => setReservationToClaim(null)}
			onOk={() => void claim()}
		>
			{reservationToClaim && <p>{reservationToClaim.book.title}: khoản thu/cọc mô phỏng 100% là {reservationToClaim.book.salePrice.toLocaleString("vi-VN")}đ. Phí thuê ròng là 60%; hoàn 40% nếu trả đúng hạn. Quá hạn sẽ mất khoản cọc. Không thu/hoàn tiền thật.</p>}
		</Modal>
	</main>;
}
