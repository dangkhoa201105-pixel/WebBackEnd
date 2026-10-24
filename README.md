# BookNest

BookNest là website thuê sách hiện đại xây dựng với Next.js App Router, React 19, Ant Design 5, Zustand persist, React Hook Form/Zod, Prisma/PostgreSQL, JWT HttpOnly Cookie và bcrypt.

## Chạy local

```bash
npm install
copy .env.example .env
npx prisma generate
npx prisma migrate dev
npm run db:seed
npm run dev
```

Mở `http://localhost:3000`. Cấu hình `DATABASE_URL` và `JWT_SECRET` trong `.env` trước khi chạy migration. `npm run db:seed` thêm tài khoản demo, danh mục và sách mẫu; không đặt lại tồn kho trên các sách đã tồn tại.

## Scripts

- `npm run dev`: development server
- `npm run build`: production build
- `npm run lint`: ESLint
- `npm test`: catalog unit tests and optional isolated PostgreSQL integration tests
- `npm run test:integration:local`: create/migrate/test/drop an isolated local PostgreSQL database
- `npm run worker:library`: scheduled reservation and due-notification worker
- Postman: import `postman/BookNest.postman_collection.json` to run the documented API demo flow
- `npx prisma studio`: quản trị dữ liệu
- `npm run db:seed`: tạo tài khoản demo, danh mục và sách mẫu

## Kiến trúc

Catalog và giao dịch được lưu bằng Prisma/PostgreSQL. Giỏ thuê chỉ giữ lựa chọn tạm thời trên trình duyệt; giá, quyền truy cập và tồn kho luôn được kiểm tra lại ở server trong transaction. Đăng nhập dùng bcrypt và JWT trong HttpOnly cookie; API xác thực lại trạng thái tài khoản/vai trò từ cơ sở dữ liệu.

Tài khoản có vai trò `USER`, `LIBRARIAN`, `ADMIN`; đăng nhập sai 5 lần khóa tài khoản, đồng thời giới hạn theo IP 20 lần trong 15 phút. Mỗi lần đăng nhập tạo một phiên có thể xem và thu hồi; đăng xuất thu hồi phiên hiện tại, còn đổi quyền/khóa tài khoản thu hồi toàn bộ phiên và tăng `tokenVersion`. Audit log ghi hoạt động nghiệp vụ nhưng không lưu mật khẩu/token. API trả sách mặc định tính phí 5.000đ/ngày trễ, phí tình trạng hỏng/mất được mô tả bên dưới.

## API nghiệp vụ chính

| Nhóm | Endpoint | Quyền |
| --- | --- | --- |
| Catalog | `GET /api/books?q=&category=&page=&limit=` | Công khai |
| Tài khoản | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET/PATCH /api/account` | Công khai / tài khoản |
| Mượn trả | `GET/POST /api/loans`, `POST /api/loans/:id/return`, `POST /api/loans/:id/extend` | Độc giả; nhân viên có thể xem và xử lý phiếu |
| Đặt trước | `GET/POST /api/reservations`, `DELETE /api/reservations/:id`, `POST /api/reservations/:id/claim` | Độc giả; nhân viên xem/hủy hàng đợi |
| Từng bản sách | `/api/admin/books/:id/copies`, `/api/admin/copies/:id`, `/api/admin/inventory/movements` | Nhân viên và Admin |
| Hồ sơ đọc | `GET/PATCH /api/reading/profile`, `GET /api/reading/insights`, `/api/notifications` | Chủ tài khoản |
| Tiền phạt | `GET /api/fines/my`, `PATCH /api/admin/fines/:id` | Chủ phiếu / nhân viên |
| Mua sách | `GET/POST /api/orders`, `GET /api/orders/my`, `PATCH /api/orders/:id`, `PATCH /api/admin/orders/:id` | Độc giả; nhân viên có thể xem/xác nhận tiền mặt |
| Bảo mật | `GET/PATCH /api/admin/security/alerts` | Admin |
| Quản trị | `/api/admin/books`, `/api/admin/categories`, `/api/admin/users`, `/api/admin/reports`, `/api/admin/audit-logs` | Admin |

Thuê sách có hai loại gói cố định 7 ngày. Thuê online tính 70% giá sách, chỉ dành cho đầu sách có ebook; quyền đọc bị API từ chối ngay khi đến hạn và worker chuyển phiếu sang `EXPIRED`. Thuê offline tính phí ròng 60%, thu/cọc mô phỏng 100% giá sách; nhân viên ghi nhận trả tại quầy và hoàn mô phỏng 40% nếu trả đúng hạn. Nếu quá hạn, khoản cọc không được hoàn; bản giấy chỉ được trả bởi nhân viên. Sách hư hỏng có thể phát sinh thêm 100.000đ; thất lạc làm mất cọc thay cho khoản phạt mất sách riêng. Các khoản tiền chỉ là mô phỏng, không thu hoặc chuyển tiền thật.

Thuê và mua hàng nhận `Idempotency-Key` tùy chọn để tránh giao dịch trùng khi retry; cùng một khóa không thể được tái sử dụng cho payload khác. Phương thức thu tiền trong demo được đánh dấu mô phỏng, không có giao dịch thật. Tồn kho thư viện được quản lý theo barcode từng bản; thuê online không giữ bản vật lý, thuê offline gắn barcode cụ thể. `Book.stock` và `Book.available` là số tổng hợp, tồn kho bán riêng tại `saleStock`.

## Tính năng nâng cao

- **Đặt trước:** khi sách được trả, bản được giữ cho người chờ đầu tiên trong 48 giờ. Worker định kỳ hết hạn lượt giữ quá thời gian và chuyển bản cho lượt tiếp theo; API đặt trước cũng kiểm tra các lượt đã hết hạn. Hàng đợi theo thời gian tạo; một độc giả không thể tạo nhiều yêu cầu đang mở cho cùng đầu sách.
- **Vòng đời bản sách:** mỗi bản có barcode và trạng thái sẵn sàng/đang mượn/đặt giữ/hỏng/thất lạc/bảo trì/đã thanh lý. Nhập, mượn, trả, bán và điều chỉnh được ghi vào lịch sử kho. Migration chuyển tồn kho cũ thành bản barcode `LEG-*` và liên kết phiếu mượn đang mở.
- **Hồ sơ đọc:** độc giả đặt mục tiêu theo tháng và chọn tối đa 5 thể loại yêu thích; `/account/reading` hiển thị tiến độ, thể loại thường mượn, gợi ý sách và thông báo trong ứng dụng. Nhắc hạn được cập nhật khi mở trang thông báo; hiện không gửi email/push.
- **Trung tâm bảo mật:** `/admin/security` hiển thị cảnh báo đăng nhập lặp lại/giới hạn tần suất và thao tác nhạy cảm để Admin tiếp nhận hoặc đánh dấu đã xử lý.
- **Khu vực nhân viên:** tài khoản `LIBRARIAN` dùng `/staff`, `/staff/inventory` và `/staff/reservations`; không được truy cập các trang Admin.
- **Tác vụ nền:** chạy `npm run worker:library` như một process riêng để tự hết hạn lượt giữ và tạo nhắc hạn/quá hạn; cấu hình chu kỳ bằng `LIBRARY_WORKER_INTERVAL_SECONDS`.
- **Quản lý phiên:** `/account/sessions` liệt kê các phiên đăng nhập đang hoạt động và cho phép thu hồi từng phiên; đổi quyền hoặc khóa tài khoản thu hồi các phiên hiện có.
- **Catalog API:** `GET /api/books` hỗ trợ phân trang, tìm kiếm, thể loại, khoảng giá, lọc còn sách và sắp xếp. OpenAPI JSON tại `GET /api/openapi`.
- **Chẩn đoán:** API trả header `x-request-id`; lỗi máy chủ trong các giao dịch quan trọng được log có cấu trúc và không đưa dữ liệu bí mật vào log.
- **Service layer:** nghiệp vụ tạo đặt trước được tách khỏi HTTP route tại `src/lib/services/reservation-service.ts`; integration test xác minh notification, audit log, bản sách và reservation cùng được ghi nhận.
- **Postman:** collection có sẵn các luồng health check, catalog, đăng nhập, mượn-trả, đặt trước, hồ sơ đọc và API quản trị. Cấu hình mật khẩu qua collection variables, không ghi mật khẩu vào collection.
- **Kiểm thử giao dịch:** `npm test` chạy unit tests; để chạy integration test, cấu hình `TEST_DATABASE_URL` trỏ tới database PostgreSQL thử nghiệm riêng đã migrate.
- **Integration test local an toàn:** `npm run test:integration:local` chỉ chấp nhận `DATABASE_URL` trỏ tới `localhost` và database `booknest`, sau đó tạo và xóa database thử nghiệm tạm thời riêng.

Chi tiết đối chiếu rubric nằm trong [docs/RUBRIC_MAPPING.md](docs/RUBRIC_MAPPING.md).
Chi tiết vận hành worker, kiểm thử, OpenAPI và backup/restore PostgreSQL: [docs/BACKEND_OPERATIONS.md](docs/BACKEND_OPERATIONS.md).
