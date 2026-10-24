import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BookNest | Thuê sách theo nhịp của bạn",
  description: "Thư viện sách hiện đại, giao tận tay bạn.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
