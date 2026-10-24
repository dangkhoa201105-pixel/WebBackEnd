"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Checkbox, Form, Image, Input, InputNumber, Select, message } from "antd";
import { useRouter } from "next/navigation";
export default function BookForm({ id }: { id?: string }) {
	const router = useRouter();
	const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
	const [coverUrl, setCoverUrl] = useState("");
	const [form] = Form.useForm();

	useEffect(() => {
		fetch("/api/admin/categories").then((response) => response.ok && response.json()).then((data) => data && setCategories(data));
		if (id) fetch(`/api/admin/books/${id}`).then((response) => response.json()).then((book) => { form.setFieldsValue(book); setCoverUrl(book.coverUrl ?? ""); });
	}, [id, form]);

	const submit = async (values: Record<string, unknown>) => {
		const response = await fetch(id ? `/api/admin/books/${id}` : "/api/admin/books", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
		if (response.ok) { message.success(id ? "Đã cập nhật sách" : "Đã thêm sách"); router.push("/admin/books"); }
		else message.error((await response.json()).message ?? "Dữ liệu chưa hợp lệ");
	};

	return (
		<Card title={id ? "Chỉnh sửa sách" : "Thêm sách mới"} style={{ maxWidth: 720, margin: "45px auto" }}>
			<Form form={form} layout="vertical" onFinish={submit} initialValues={{ featured: false, stock: 1, pricePerDay: 10000, salePrice: 0, saleStock: 0 }}>
				<Form.Item name="title" label="Tên sách" rules={[{ required: true }]}><Input /></Form.Item>
				<Form.Item name="author" label="Tác giả" rules={[{ required: true }]}><Input /></Form.Item>
				<Form.Item name="description" label="Giới thiệu / mô tả" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
				<Alert
					type="info"
					showIcon
					style={{ marginBottom: 16 }}
					message="Nội dung đọc online"
					description="Chỉ nhập nội dung bạn sở hữu hoặc được cấp phép. Nội dung chỉ được trả về cho độc giả có phiếu mượn còn hạn hoặc đã mua sách; để trống nếu ebook chưa sẵn sàng."
				/>
				<Form.Item name="readerContent" label="Nội dung ebook (văn bản thuần, tối đa 500.000 ký tự)">
					<Input.TextArea rows={14} maxLength={500_000} showCount />
				</Form.Item>
				<Form.Item name="coverUrl" label="URL hình ảnh bìa"><Input placeholder="https://...jpg" onChange={(event) => setCoverUrl(event.target.value)} /></Form.Item>
				{coverUrl && <Image alt="Xem trước ảnh bìa" width={150} height={210} style={{ objectFit: "cover", marginBottom: 16 }} src={coverUrl} preview />}
				<Form.Item name="pricePerDay" label="Giá thuê mỗi ngày" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
				<Form.Item name="stock" label="Tổng số bản dành cho thư viện" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
				<Form.Item name="salePrice" label="Giá bán (0 = không bán)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
				<Form.Item name="saleStock" label="Số lượng tồn kho bán" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
				<Form.Item name="categoryId" label="Danh mục" rules={[{ required: true }]}><Select options={categories.map((category) => ({ value: category.id, label: category.name }))} /></Form.Item>
				<Form.Item name="featured" valuePropName="checked"><Checkbox>Đưa vào sách nổi bật</Checkbox></Form.Item>
				<Button type="primary" htmlType="submit" block>{id ? "LƯU THAY ĐỔI" : "THÊM SÁCH"}</Button>
			</Form>
		</Card>
	);
}
