"use client";

import { Form, Input, Button, Card, Typography, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../auth.module.css";

export default function RegisterPage() {
	const router = useRouter();
	const [messageApi, contextHolder] = message.useMessage();

	const register = async (values: { name: string; email: string; phone: string; password: string }) => {
		const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
		const result = await response.json();
		if (!response.ok) { messageApi.error(result.message ?? "Không thể tạo tài khoản"); return; }

		messageApi.success({ content: "Tạo tài khoản thành công. Đang mở hồ sơ...", duration: 1.5 });
		window.setTimeout(() => router.push("/account"), 1500);
	};

	return <main className={styles.auth}>{contextHolder}<Card className={styles.card}>
		<Link className={styles.back} href="/">← BookNest</Link>
		<Typography.Title level={2}>Tạo tài khoản</Typography.Title>
		<Typography.Paragraph>Bắt đầu xây dựng góc đọc của riêng bạn.</Typography.Paragraph>
		<Form layout="vertical" onFinish={register}>
			<Form.Item name="name" label="Họ tên" rules={[{ required: true, min: 2 }]}><Input size="large" /></Form.Item>
			<Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}><Input size="large" /></Form.Item>
			<Form.Item name="phone" label="Số điện thoại" rules={[{ required: true, min: 9 }]}><Input size="large" /></Form.Item>
			<Form.Item name="password" label="Mật khẩu" rules={[{ required: true, min: 8 }]}><Input.Password size="large" /></Form.Item>
			<Button type="primary" htmlType="submit" block size="large">Tạo tài khoản</Button>
		</Form>
		<p className={styles.switch}>Đã có tài khoản? <Link href="/login">Đăng nhập</Link></p>
	</Card></main>;
}
