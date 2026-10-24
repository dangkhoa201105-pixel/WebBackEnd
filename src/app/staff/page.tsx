"use client";

import Link from "next/link";
import { Button, Card, Space, Typography } from "antd";

export default function StaffPage() {
	return <main style={{ maxWidth: 900, margin: "50px auto", padding: 24 }}>
		<Typography.Title level={2}>Nghiệp vụ nhân viên thư viện</Typography.Title>
		<Typography.Paragraph>Quản lý bản sách, đặt trước, trả sách và tình trạng bảo trì.</Typography.Paragraph>
		<Space wrap>
			<Link href="/staff/inventory"><Button type="primary">Bản sách và tồn kho</Button></Link>
			<Link href="/staff/loans"><Button>Phiếu thuê và hoàn cọc</Button></Link>
			<Link href="/staff/reservations"><Button>Hàng đợi đặt trước</Button></Link>
			<Link href="/account"><Button>Tài khoản</Button></Link>
		</Space>
		<Card style={{ marginTop: 24 }}><Typography.Text>Admin có thể sử dụng các màn hình này trong khu vực quản trị.</Typography.Text></Card>
	</main>;
}
