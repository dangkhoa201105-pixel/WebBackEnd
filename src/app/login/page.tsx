"use client";

import { Form, Input, Button, Card, Typography, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../auth.module.css";

export default function LoginPage() {
	const router = useRouter();
	const [messageApi, contextHolder] = message.useMessage();

	const login = async (values: { email: string; password: string }) => {
		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(values),
			});
			const result = await response.json();
			if (!response.ok) {
				messageApi.error(result.message ?? "Không thể đăng nhập");
				return;
			}
			const destination = new URL(window.location.href).searchParams.get("next") ?? "/";
			router.push(destination.startsWith("/") && !destination.startsWith("//") ? destination : "/");
		} catch {
			messageApi.error("Không thể kết nối đến máy chủ");
		}
	};

	return <main className={styles.auth}>{contextHolder}<Card className={styles.card}>
		<Link className={styles.back} href="/">← BookNest</Link>
		<Typography.Title level={2}>Chào mừng trở lại</Typography.Title>
		<Typography.Paragraph>Đăng nhập để quản lý sách đang mượn và đơn hàng.</Typography.Paragraph>
		<Form layout="vertical" onFinish={login}>
			<Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}><Input size="large" /></Form.Item>
			<Form.Item name="password" label="Mật khẩu" rules={[{ required: true }]}><Input.Password size="large" /></Form.Item>
			<Button type="primary" htmlType="submit" block size="large">Đăng nhập</Button>
		</Form>
		<p className={styles.switch}>Chưa có tài khoản? <Link href="/register">Đăng ký ngay</Link></p>
	</Card></main>;
}
