"use client";

import { useEffect, useState } from "react";
import { Button, Card, Form, Input, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./account.module.css";

type Profile = { id: string; name: string; email: string; phone: string; role: "USER" | "LIBRARIAN" | "ADMIN"; avatarUrl: string | null; coverUrl: string | null; rentalCount: number; activeRentalCount: number; orderCount: number; unpaidFineTotal: number };
const defaultAvatar = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80";

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [coverUrl, setCoverUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    fetch("/api/account").then(async (response) => {
      if (response.status === 401) { router.push("/login"); return; }
      const data = await response.json();
      if (response.ok) { setProfile(data); setCoverUrl(data.coverUrl ?? ""); setAvatarUrl(data.avatarUrl ?? ""); }
    });
  }, [router]);

  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); };
  const saveProfile = async (values: { name: string; phone: string }) => {
    setSaving(true); setError("");
    const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, coverUrl, avatarUrl }) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) { setError(data.message ?? "Không thể cập nhật hồ sơ"); return; }
    setProfile((current) => current ? { ...current, ...data } : data);
    messageApi.success("Đã lưu thông tin hồ sơ");
  };

  if (!profile) return <main className={styles.account}><div className={styles.shell}>Đang tải hồ sơ...</div></main>;

  return <main className={styles.account}>{contextHolder}<div className={styles.shell}>
    <div className={styles.topbar}><Link className={styles.back} href="/">← Về BookNest</Link><Button className={styles.logout} onClick={logout}>Đăng xuất</Button></div>
    <Card className={styles.profileCard} styles={{ body: { padding: 0 } }}><div className={styles.cover} style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}><div className={styles.coverShade} /></div><div className={styles.profileContent}><img className={styles.avatar} src={avatarUrl || defaultAvatar} alt="Ảnh đại diện" /><div className={styles.identity}><div><h1>{profile.name}</h1><p>{profile.email}</p></div><span className={styles.role}>{profile.role === "ADMIN" ? "Quản trị viên" : profile.role === "LIBRARIAN" ? "Nhân viên thư viện" : "Thành viên BookNest"}</span></div><div className={styles.details}><div><span className={styles.detailLabel}>Email</span><span className={styles.detailValue}>{profile.email}</span></div><div><span className={styles.detailLabel}>Số điện thoại</span><span className={styles.detailValue}>{profile.phone}</span></div></div></div></Card>
    <div className={styles.stats}><div><strong>{profile.rentalCount}</strong><span>Lượt mượn</span></div><div><strong>{profile.activeRentalCount}</strong><span>Đang mượn</span></div><div><strong>{profile.orderCount}</strong><span>Đơn mua</span></div><div><strong>{profile.unpaidFineTotal.toLocaleString("vi-VN")}đ</strong><span>Phạt chưa thanh toán</span></div></div>
    <Card title="Lịch sử và theo dõi" style={{ marginTop: 18, marginBottom: 24 }}><Button onClick={() => router.push("/account/history")}>Phiếu mượn, đơn mua và tiền phạt</Button><Button style={{ marginLeft: 8 }} onClick={() => router.push("/account/library")}>Tủ sách online</Button><Button style={{ marginLeft: 8 }} onClick={() => router.push("/account/reservations")}>Đặt trước sách</Button><Button style={{ marginLeft: 8 }} onClick={() => router.push("/account/reading")}>Hồ sơ đọc sách</Button><Button style={{ marginLeft: 8 }} onClick={() => router.push("/account/sessions")}>Phiên đăng nhập</Button></Card>
    {profile.role !== "USER" && <Card title={profile.role === "ADMIN" ? "Khu vực quản trị" : "Nghiệp vụ thư viện"} style={{ marginBottom: 24 }}><p>Quản lý giao dịch và dữ liệu BookNest theo quyền được cấp.</p><Button type="primary" onClick={() => router.push(profile.role === "ADMIN" ? "/admin" : "/staff")}>{profile.role === "ADMIN" ? "Mở dashboard" : "Mở khu vực nhân viên"}</Button></Card>}
    <Card className={styles.edit} title="Chỉnh sửa hồ sơ"><Form layout="vertical" initialValues={{ name: profile.name, phone: profile.phone }} onFinish={saveProfile}><Form.Item name="name" label="Họ tên" rules={[{ required: true, min: 2 }]}><Input size="large" /></Form.Item><Form.Item name="phone" label="Số điện thoại" rules={[{ required: true, min: 9 }]}><Input size="large" /></Form.Item><Form.Item label="URL ảnh nền"><Input size="large" value={coverUrl} onChange={(event) => setCoverUrl(event.target.value)} placeholder="https://...jpg" /></Form.Item>{coverUrl && <img className={styles.preview} src={coverUrl} alt="Preview ảnh nền" />}<Form.Item label="URL ảnh đại diện"><Input size="large" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://...jpg" /></Form.Item>{error && <p className={styles.error}>{error}</p>}<Button className={styles.save} type="primary" htmlType="submit" loading={saving}>Lưu thông tin</Button></Form></Card>
  </div></main>;
}
