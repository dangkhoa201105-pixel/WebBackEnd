/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
"use client";
import { useEffect, useState } from "react";
import { Button, Card, Input, Space, Table, Tag, message } from "antd";
import Link from "next/link";

type Book = { id: string; title: string; author: string; pricePerDay: number; stock: number; featured: boolean; hasDigitalContent: boolean; category: { name: string } };

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [q, setQ] = useState("");
  const load = async () => { const response = await fetch("/api/admin/books"); if (response.ok) { const data: Book[] = await response.json(); setBooks(data.filter((book) => !q || `${book.title} ${book.author}`.toLowerCase().includes(q.toLowerCase()))); } };
  useEffect(() => { load(); }, [q]);
  const remove = async (id: string) => { const response = await fetch(`/api/admin/books/${id}`, { method: "DELETE" }); if (response.ok) { message.success("Đã xóa sách"); load(); } else message.error("Không thể xóa sách đang có lịch thuê"); };

  return <main style={{ maxWidth: 1150, margin: "45px auto", padding: 24 }}>
    <Link href="/admin">← Dashboard</Link>
    <Space style={{ width: "100%", justifyContent: "space-between", margin: "20px 0" }}><div><h1>Quản lý sách</h1><Input.Search placeholder="Tìm sách hoặc tác giả" onSearch={setQ} style={{ width: 280 }} /></div></Space>
    <Card title="Thêm sách vào dữ liệu" size="small" style={{ marginBottom: 20 }}><Space wrap><span>Nhập tên, tác giả, thể loại, giá, tồn kho và URL hình ảnh sản phẩm.</span><Link href="/admin/books/new"><Button type="primary">+ Thêm sách</Button></Link></Space></Card>
    <Table rowKey="id" dataSource={books} columns={[{ title: "Tên sách", dataIndex: "title" }, { title: "Tác giả", dataIndex: "author" }, { title: "Danh mục", render: (_: unknown, book: Book) => book.category.name }, { title: "Giá/ngày", render: (_: unknown, book: Book) => `${book.pricePerDay.toLocaleString("vi-VN")}đ` }, { title: "Tồn kho", dataIndex: "stock" }, { title: "Ebook online", render: (_: unknown, book: Book) => book.hasDigitalContent ? <Tag color="green">Đã có</Tag> : <Tag color="orange">Chưa có</Tag> }, { title: "Nổi bật", render: (_: unknown, book: Book) => book.featured ? <Tag color="gold">Có</Tag> : "-" }, { title: "Thao tác", render: (_: unknown, book: Book) => <Space><Link href={`/admin/books/${book.id}`}><Button size="small">Sửa</Button></Link><Button danger size="small" onClick={() => remove(book.id)}>Xóa</Button></Space> }]} />
  </main>;
}
