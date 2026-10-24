/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { Avatar, Button, Dropdown, MenuProps, message } from "antd";
import { LoginOutlined, LogoutOutlined, SettingOutlined, SwapOutlined, UserOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

type Account = { name: string; email: string; avatarUrl: string | null };
const defaultAvatar = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80";

export default function AccountMenu() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAccount = async () => {
    const response = await fetch("/api/account", { cache: "no-store" });
    if (response.ok) setAccount(await response.json());
    else setAccount(null);
    setLoading(false);
  };

  useEffect(() => { loadAccount(); }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAccount(null);
    message.success("Đã đăng xuất");
  };

  if (loading) return <Button className={styles.accountButton} type="text" loading />;
  if (!account) return <Dropdown menu={{ items: [{ key: "login", icon: <LoginOutlined />, label: <a href="/login">Đăng nhập</a> }, { key: "register", label: <a href="/register">Đăng ký tài khoản</a> }] }} placement="bottomRight"><Button className={styles.accountButton} type="text" icon={<UserOutlined />}>Tài khoản</Button></Dropdown>;

  const username = `@${account.email.split("@")[0]}`;
  const items: MenuProps["items"] = [
    { key: "identity", disabled: true, label: <div className={styles.accountIdentity}><Avatar size={42} src={account.avatarUrl || defaultAvatar} icon={<UserOutlined />} /><div><strong>{account.name}</strong><span>{username}</span></div></div> },
    { type: "divider" },
    { key: "profile", icon: <UserOutlined />, label: "Xem trang cá nhân", onClick: () => router.push("/account") },
    { key: "account", icon: <SettingOutlined />, label: "Tài khoản", onClick: () => router.push("/account") },
    { key: "switch", icon: <SwapOutlined />, label: "Chuyển đổi tài khoản", onClick: async () => { await logout(); router.push("/login"); } },
    { key: "logout", icon: <LogoutOutlined />, label: "Đăng xuất", onClick: logout },
  ];

  return <Dropdown menu={{ items }} placement="bottomRight" trigger={["click"]}><button className={styles.avatarButton} type="button" aria-label="Mở menu tài khoản"><Avatar size={36} src={account.avatarUrl || defaultAvatar} icon={<UserOutlined />} /></button></Dropdown>;
}
