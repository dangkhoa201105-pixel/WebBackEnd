# BookNest rubric mapping

| Hạng mục | Trạng thái | Vị trí |
| --- | --- | --- |
| Next.js App Router REST API | Có | `src/app/api` |
| PostgreSQL và quan hệ dữ liệu | Có | `prisma/schema.prisma`, `prisma/migrations` |
| Độc giả, thủ thư, admin | Có | `Role`, `src/lib/auth.ts`, `src/app/api/admin/users` |
| Băm mật khẩu và JWT HttpOnly cookie | Có | `src/app/api/auth`, `src/lib/auth.ts` |
| Khóa tài khoản và giới hạn đăng nhập | Có | `User.status`, `LoginAttempt`, `src/app/api/auth/login` |
| Tìm kiếm sách và phân trang | Có | `src/app/api/books/route.ts` |
| Mượn, trả, gia hạn và tồn kho | Có | `src/app/api/loans`, `Rental` |
| Tính phí trễ hạn/hư hỏng/mất sách | Có | `src/app/api/loans/[id]/return`, `Fine` |
| Đặt trước FIFO, giữ bản 48 giờ, chuyển lượt khi hết hạn | Có | `src/app/api/reservations`, `Reservation` |
| Mã barcode và vòng đời từng bản | Có | `BookCopy`, `src/app/api/admin/copies` |
| Lịch sử nhập/xuất/mượn/trả/bảo trì/bán | Có | `InventoryMovement`, `src/app/api/admin/inventory/movements` |
| Đơn mua, thanh toán mô phỏng, tồn kho bán | Có | `src/app/api/orders`, `src/app/api/admin/orders`, `Order`, `OrderItem` |
| Idempotency đơn hàng | Có | Header `Idempotency-Key`, `Order.idempotencyKey` |
| Audit log quản trị/nghiệp vụ | Có | `AuditLog`, `src/app/api/admin/audit-logs` |
| Hồ sơ đọc, mục tiêu tháng và gợi ý | Có | `ReadingProfile`, `src/app/api/reading` |
| Nhắc hạn và thông báo đặt trước | Có | `Notification`, `src/app/api/notifications` |
| Cảnh báo hành vi bảo mật | Có | `SecurityAlert`, `src/app/api/admin/security/alerts` |
| Giao dịch tồn kho và audit nguyên tử | Có | Các route mượn/trả, mua hàng và quản trị |
| Tách route và nghiệp vụ theo service layer | Có một luồng mẫu | `src/app/api/reservations/route.ts`, `src/lib/services/reservation-service.ts` |
| Postman Collection có kiểm tra tự động | Có | `postman/BookNest.postman_collection.json` |
| Kiểm thử integration với PostgreSQL biệt lập | Có | `npm run test:integration:local`, `tests/library.integration.test.ts` |
| Worker xử lý nhắc hạn/hết hạn reservation | Có | `scripts/library-worker.ts`, `src/lib/scheduled-jobs.ts` |
| Upload ảnh production | Chưa triển khai | Hiện nhận URL ảnh |
| Deploy online | Chưa triển khai | Cần cấu hình PostgreSQL, `JWT_SECRET` và hosting |

## Tài khoản seed

- Admin: `admin@booknest.vn` / `BookNest@123`
- Độc giả: `customer@booknest.vn` / `User@12345`

Seed chỉ tạo dữ liệu mẫu ban đầu và không ghi đè số lượng tồn kho sách khi chạy lại. Đổi mật khẩu demo và cấu hình `JWT_SECRET` mạnh trước khi triển khai.
