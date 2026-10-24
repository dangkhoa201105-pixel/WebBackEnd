"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, App, Badge, Button, Drawer, Input, Modal, Segmented, Select, Tag, message } from "antd";
import { BookOutlined, CalendarOutlined, DeleteOutlined, HeartOutlined, MenuOutlined, SearchOutlined, ShoppingOutlined, StarFilled } from "@ant-design/icons";
import type { Book } from "@/lib/books";
import { formatCurrency } from "@/lib/books";
import { getRentalQuote, RENTAL_PERIOD_DAYS, type RentalMode } from "@/lib/rental-pricing";
import { useCartStore } from "@/store/cart-store";
import AccountMenu from "./account-menu";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tất cả");
  const [catalogMode, setCatalogMode] = useState<"rent" | "buy">("rent");
  const [cartOpen, setCartOpen] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState(["Tất cả"]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [rentalCheckoutOpen, setRentalCheckoutOpen] = useState(false);
  const [checkingPurchase, setCheckingPurchase] = useState(false);
  const [checkoutAttempt, setCheckoutAttempt] = useState<{ signature: string; key: string } | null>(null);
  const [purchaseAttempt, setPurchaseAttempt] = useState<{ bookId: string; key: string } | null>(null);
  const [bookToBuy, setBookToBuy] = useState<Book | null>(null);
  const [reservingBookId, setReservingBookId] = useState<string | null>(null);
  const { items, rentalMode, addItem, setRentalMode, removeItem, clear } = useCartStore();
  useEffect(() => {
    fetch("/api/books?limit=50", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Không thể tải danh sách sách");
      const result = await response.json() as { data: Array<{ id: string; title: string; author: string; description: string; coverUrl: string | null; featured: boolean; hasDigitalContent: boolean; pricePerDay: number; salePrice: number; saleStock: number; stock: number; available: number; category: { name: string } }> };
      const mappedBooks = result.data.map((book) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        category: book.category.name,
        description: book.description,
        rating: 4.8,
        available: book.available,
        total: book.stock,
        pricePerDay: book.pricePerDay,
        salePrice: book.salePrice,
        saleStock: book.saleStock,
        hasDigitalContent: book.hasDigitalContent,
        cover: book.coverUrl ?? "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=700&q=85",
        accent: "#52796f",
        featured: book.featured,
      }));
      setBooks(mappedBooks);
      setCategories(["Tất cả", ...new Set(mappedBooks.map((book) => book.category))]);
    }).catch((error: unknown) => {
      message.error(error instanceof Error ? error.message : "Không thể tải danh sách sách");
    });
  }, []);
  const visibleBooks = useMemo(() => books.filter((book) =>
    `${book.title} ${book.author}`.toLowerCase().includes(query.toLowerCase()) &&
    (category === "Tất cả" || book.category === category) &&
    (catalogMode === "rent"
      ? (book.salePrice ?? 0) > 0 && (rentalMode === "OFFLINE" || book.hasDigitalContent)
      : (book.salePrice ?? 0) > 0 && (book.saleStock ?? 0) > 0)), [books, catalogMode, category, query, rentalMode]);
  const hasSalePrice = (book: Book): book is Book & { salePrice: number } =>
    Number.isSafeInteger(book.salePrice) && (book.salePrice ?? 0) > 0;
  const cartHasValidPrices = items.every(hasSalePrice);
  const total = items.reduce((sum, item) => sum + (hasSalePrice(item) ? getRentalQuote(item.salePrice, rentalMode).amountDue : 0), 0);
  const totalRefund = items.reduce((sum, item) => sum + (hasSalePrice(item) ? Math.round(getRentalQuote(item.salePrice, rentalMode).refundableDeposit * 0.4) : 0), 0);
  const handleAdd = (book: (typeof books)[number]) => {
    if (items.some((item) => item.id === book.id)) { setCartOpen(true); return; }
    if (!hasSalePrice(book)) {
      message.error("Sách chưa được cấu hình giá để thuê");
      return;
    }
    if (rentalMode === "ONLINE" && !book.hasDigitalContent) {
      message.warning("Sách này chưa có ebook online");
      return;
    }
    addItem(book);
    message.success(`${book.title} đã được thêm vào giỏ thuê ${rentalMode === "ONLINE" ? "online" : "tại thư viện"}`);
  };
  const reserveBook = async (book: Book) => {
    setReservingBookId(book.id);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.id }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login?next=%2F");
        return;
      }
      if (!response.ok) {
        message.error(result.message ?? "Không thể đặt trước sách");
        return;
      }
      message.success(result.status === "READY" ? "Sách đã sẵn sàng, xác nhận trong 48 giờ." : "Đã vào hàng đợi đặt trước.");
    } catch {
      message.error("Không thể kết nối đến máy chủ");
    } finally {
      setReservingBookId(null);
    }
  };
  const checkout = () => {
    if (items.length === 0) return;
    if (!cartHasValidPrices) {
      message.error("Một sách trong giỏ chưa có giá hợp lệ. Hãy xóa sách đó khỏi giỏ hoặc thêm lại từ danh mục.");
      return;
    }
    setRentalCheckoutOpen(true);
  };
  const confirmRentalCheckout = async () => {
    if (!cartHasValidPrices) {
      message.error("Một sách trong giỏ chưa có giá hợp lệ. Hãy xóa sách đó khỏi giỏ hoặc thêm lại từ danh mục.");
      setRentalCheckoutOpen(false);
      return;
    }
    setCheckingOut(true);
    const signature = JSON.stringify({ rentalMode, items: items.map((item) => ({ bookId: item.id, days: RENTAL_PERIOD_DAYS })).sort((a, b) => a.bookId.localeCompare(b.bookId)) });
    const idempotencyKey = checkoutAttempt?.signature === signature ? checkoutAttempt.key : crypto.randomUUID();
    setCheckoutAttempt({ signature, key: idempotencyKey });
    try {
      const response = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ rentalMode, items: items.map((item) => ({ bookId: item.id, days: RENTAL_PERIOD_DAYS })) }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push("/login?next=%2F");
        return;
      }
      if (!response.ok) {
        message.error(result.message ?? "Không thể tạo phiếu mượn");
        return;
      }
      clear();
      setCheckoutAttempt(null);
      setRentalCheckoutOpen(false);
      setCartOpen(false);
      message.success("Đã xác nhận thanh toán mô phỏng và tạo phiếu thuê.");
      router.push("/account/history");
    } catch {
      message.error("Không thể kết nối đến máy chủ");
    } finally {
      setCheckingOut(false);
    }
  };
  const buyBook = (book: Book) => {
    if (!book.salePrice || book.salePrice <= 0 || !book.saleStock || book.saleStock <= 0) return;
    setBookToBuy(book);
  };
  const confirmPurchase = async () => {
    if (!bookToBuy) return;
    const book = bookToBuy;
    const idempotencyKey = purchaseAttempt?.bookId === book.id ? purchaseAttempt.key : crypto.randomUUID();
    setPurchaseAttempt({ bookId: book.id, key: idempotencyKey });
    setCheckingPurchase(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ items: [{ bookId: book.id, quantity: 1 }], paymentMethod: "SIMULATED" }),
      });
      const result = await response.json();
      if (response.status === 401) {
        setBookToBuy(null);
        router.push("/login?next=%2F");
        return;
      }
      if (!response.ok) {
        message.error(result.message ?? "Không thể tạo đơn mua");
        return;
      }
      setPurchaseAttempt(null);
      setBookToBuy(null);
      message.success("Đặt mua thành công (thanh toán mô phỏng, không trừ tiền thật).");
      router.push("/account/history");
    } catch {
      message.error("Không thể kết nối đến máy chủ. Hãy kiểm tra lịch sử giao dịch trước khi thử lại.");
    } finally {
      setCheckingPurchase(false);
    }
  };

  return <App><div className={styles.page}>
    <header className={styles.header}><div className={styles.headerInner}><a className={styles.brand} href="#top"><span className={styles.brandMark}><BookOutlined /></span><span>book<span>Nest</span></span></a><nav className={styles.nav}><a className={styles.activeLink} href="#books">Khám phá</a><a href="#how-it-works">Cách hoạt động</a><a href="#about">Về BookNest</a></nav><div className={styles.headerActions}><Button className={styles.iconButton} type="text" icon={<HeartOutlined />} /><AccountMenu /><Badge count={items.length} size="small"><Button className={styles.cartButton} icon={<ShoppingOutlined />} onClick={() => setCartOpen(true)}>Giỏ thuê</Button></Badge></div><Button className={styles.mobileMenu} type="text" icon={<MenuOutlined />} /></div></header>
    <main id="top"><section className={styles.hero}><div className={styles.heroCopy}><p className={styles.eyebrow}>Đọc nhiều hơn. Sống sâu hơn.</p><h1>Một thư viện nhỏ<br /><em>cho những ngày lớn.</em></h1><p className={styles.heroText}>Thuê những cuốn sách bạn muốn đọc, chỉ trong vài phút. Không cần mua cả tủ sách để bắt đầu một hành trình mới.</p><Button className={styles.heroButton} type="primary" href="#books">Khám phá bộ sưu tập <span>↗</span></Button><div className={styles.heroNote}><div className={styles.avatarStack}><span>LN</span><span>MT</span><span>KA</span></div><span>Hơn 2,000 độc giả đang đọc cùng BookNest</span></div></div><div className={styles.heroVisual}><div className={styles.sunShape} /><div className={styles.heroCard}><div className={styles.bookSpine}>BOOK<br />NEST</div><div className={styles.heroBook}><span>THE<br /><strong>ART</strong><br />OF<br />SLOW<br />LIVING</span></div><div className={styles.heroLabel}>Gợi ý hôm nay<br /><strong>Đọc chậm, sống đầy</strong></div></div><div className={styles.floatingQuote}>“Reading is a way<br />of travelling without<br />moving your feet.”</div></div></section>
      <section className={styles.catalog} id="books">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Bộ sưu tập được tuyển chọn</p><h2>Chọn một cuốn cho <em>hôm nay.</em></h2></div>
          <span className={styles.resultCount}>{visibleBooks.length} cuốn sách</span>
        </div>
        <Alert
          style={{ marginBottom: 20 }}
          type="info"
          showIcon
          message="Chọn một trong hai hình thức thuê hoặc mua"
          description="Thuê online: thanh toán mô phỏng 70% giá sách để đọc ebook trong 7 ngày, hết hạn tự khóa. Thuê offline: trả trước 100% giá sách làm cọc, phí thuê ròng 60%; trả đúng hạn được hoàn 40%, quá hạn mất cọc. Mua sách cấp quyền đọc vô thời hạn sau khi thanh toán mô phỏng. Không có giao dịch tiền thật."
        />
        <div className={styles.catalogLayout}>
          <aside className={styles.filters}>
            <div className={styles.filterTitle}>Bộ lọc <button onClick={() => { setCategory("Tất cả"); setQuery(""); }}>Đặt lại</button></div>
            <label className={styles.filterLabel}>Thể loại</label>
            <div className={styles.categoryList}>{categories.map((item) => <button className={category === item ? styles.selectedCategory : ""} key={item} onClick={() => setCategory(item)}>{item}<span>{item === "Tất cả" ? books.length : books.filter((book) => book.category === item).length}</span></button>)}</div>
            <div className={styles.filterTip}><CalendarOutlined /><span>{catalogMode === "rent" ? rentalMode === "ONLINE" ? "Thuê ebook: 70% giá sách, quyền đọc 7 ngày." : "Thuê tại quầy: cọc 100%, hoàn 40% nếu trả đúng hạn." : "Mua ebook: quyền đọc vô thời hạn sau khi thanh toán."}</span></div>
          </aside>
          <div className={styles.results}>
            <div className={styles.searchRow}>
              <Segmented
                value={catalogMode}
                options={[{ label: "Thuê sách", value: "rent" }, { label: "Mua sách", value: "buy" }]}
                onChange={(value) => setCatalogMode(value === "buy" ? "buy" : "rent")}
              />
              {catalogMode === "rent" && <Segmented
                value={rentalMode}
                options={[{ label: "Thuê online · 7 ngày", value: "ONLINE" }, { label: "Thuê offline · cọc", value: "OFFLINE" }]}
                onChange={(value) => {
                  const nextMode: RentalMode = value === "ONLINE" ? "ONLINE" : "OFFLINE";
                  if (items.length > 0 && nextMode !== rentalMode) {
                    message.warning("Hãy hoàn tất hoặc xóa giỏ thuê hiện tại trước khi đổi hình thức.");
                    return;
                  }
                  setRentalMode(nextMode);
                }}
              />}
              <Input className={styles.searchInput} size="large" prefix={<SearchOutlined />} placeholder="Tìm theo tên sách hoặc tác giả..." value={query} onChange={(event) => setQuery(event.target.value)} />
              <Select className={styles.sortSelect} size="large" defaultValue="popular" options={[{ value: "popular", label: "Phổ biến nhất" }, { value: "price", label: "Giá thấp nhất" }]} />
            </div>
            <div className={styles.bookGrid}>
              {visibleBooks.map((book) => <article className={styles.bookCard} key={book.id}>
                <div className={styles.coverWrap} style={{ backgroundColor: book.accent }}>
                  <img src={book.cover} alt={book.title} />
                  <button className={styles.favorite}><HeartOutlined /></button>
                  {book.featured && <Tag className={styles.featuredTag}>Nổi bật</Tag>}
                </div>
                <div className={styles.bookInfo}>
                  <div className={styles.bookMeta}><span>{book.category}</span><span><StarFilled /> {book.rating}</span></div>
                  <h3>{book.title}</h3>
                  <p>{book.author}</p>
                  {catalogMode === "rent" && <Tag color={rentalMode === "ONLINE" ? "green" : "blue"}>{rentalMode === "ONLINE" ? "Ebook online · 7 ngày" : "Bản giấy · thuê tại quầy"}</Tag>}
                  {catalogMode === "buy" && <Tag color={book.hasDigitalContent ? "green" : "orange"}>{book.hasDigitalContent ? "Có ebook online" : "Đang bổ sung nội dung ebook"}</Tag>}
                  <div className={styles.cardFooter}>
                    {catalogMode === "rent" ? <>
                      <div>
                        <strong>{formatCurrency(getRentalQuote(book.salePrice ?? 0, rentalMode).rentalFee)}</strong>
                        <small>{rentalMode === "ONLINE" ? " / 7 ngày" : " / thuê 7 ngày"}</small>
                      </div>
                      {rentalMode === "ONLINE"
                        ? <Button className={styles.addButton} type="primary" onClick={() => handleAdd(book)} icon={<BookOutlined />}>Thuê ebook</Button>
                        : book.available > 0
                        ? <Button className={styles.addButton} type="primary" onClick={() => handleAdd(book)} icon={<ShoppingOutlined />}>Thuê đọc</Button>
                        : <Button className={styles.addButton} loading={reservingBookId === book.id} onClick={() => void reserveBook(book)}>Đặt trước</Button>}
                    </> : <>
                      <div><strong>{formatCurrency(book.salePrice ?? 0)}</strong><small> / mua</small></div>
                      <Button className={styles.addButton} type="primary" onClick={() => buyBook(book)}>Mua & đọc vô thời hạn</Button>
                    </>}
                  </div>
                </div>
              </article>)}
            </div>
            {visibleBooks.length === 0 && <div className={styles.emptyState}>{catalogMode === "buy" ? "Chưa có sách nào được mở bán." : rentalMode === "ONLINE" ? "Chưa có sách nào được bổ sung ebook online." : "Không tìm thấy sách phù hợp. Hãy thử bộ lọc khác."}</div>}
          </div>
        </div>
      </section>
      <section className={styles.impact} id="how-it-works"><div><p className={styles.eyebrow}>BookNest khác biệt</p><h2>Đọc theo nhịp<br /><em>của riêng bạn.</em></h2></div><div className={styles.impactItems}><div><span>01</span><h3>Chọn sách</h3><p>Chọn thuê ebook online hoặc mượn bản giấy tại quầy.</p></div><div><span>02</span><h3>Thuê 7 ngày</h3><p>Ebook tự khóa khi hết hạn; bản giấy cần trả tại thư viện.</p></div><div><span>03</span><h3>Nhận hoàn cọc</h3><p>Trả bản giấy đúng hạn để được hoàn 40% khoản đã đặt cọc.</p></div></div></section>
    </main>
    <Drawer
      title={<div className={styles.drawerTitle}><span>{rentalMode === "ONLINE" ? "Giỏ thuê ebook online" : "Giỏ thuê sách giấy"}</span><small>{items.length} cuốn · 7 ngày</small></div>}
      placement="right"
      width={420}
      open={cartOpen}
      onClose={() => setCartOpen(false)}
      footer={items.length ? <div className={styles.drawerFooter}>
        <div><span>{rentalMode === "ONLINE" ? "Thanh toán mô phỏng" : "Tiền thu/cọc mô phỏng"}</span><strong>{formatCurrency(total)}</strong></div>
        {rentalMode === "OFFLINE" && <div><span>Hoàn khi trả đúng hạn (40%)</span><strong>{formatCurrency(totalRefund)}</strong></div>}
        {!cartHasValidPrices && <p>Giỏ có sách chưa được cấu hình giá; hãy xóa và thêm lại sách đó.</p>}
        <Button type="primary" block size="large" loading={checkingOut} disabled={!cartHasValidPrices} onClick={checkout}>
          {rentalMode === "ONLINE" ? "Thuê ebook 7 ngày" : "Đặt cọc thuê tại quầy"} <span>→</span>
        </Button>
      </div> : null}
    >
      <div className={styles.cartList}>
        {items.length === 0
          ? <div className={styles.emptyCart}><ShoppingOutlined /><h3>Giỏ thuê đang trống</h3><p>Chọn sách để bắt đầu thuê.</p></div>
          : items.map((item) => {
            const quote = hasSalePrice(item) ? getRentalQuote(item.salePrice, rentalMode) : null;
            return <div className={styles.cartItem} key={item.id}>
              <img src={item.cover} alt="" />
              <div>
                <strong>{item.title}</strong>
                {quote ? <small>Phí thuê 7 ngày: {formatCurrency(quote.rentalFee)}</small> : <small>Chưa có giá thuê hợp lệ</small>}
                {quote && rentalMode === "OFFLINE"
                  ? <small>Thu/cọc: {formatCurrency(quote.amountDue)} · hoàn đúng hạn: {formatCurrency(Math.round(quote.refundableDeposit * 0.4))}</small>
                  : quote && <small>Đọc online đến hết hạn 7 ngày</small>}
              </div>
              <Button type="text" icon={<DeleteOutlined />} onClick={() => removeItem(item.id)} />
            </div>;
          })}
      </div>
    </Drawer>
    <Modal
      title={rentalMode === "ONLINE" ? "Xác nhận thuê ebook online" : "Xác nhận cọc thuê sách giấy"}
      open={rentalCheckoutOpen}
      confirmLoading={checkingOut}
      okText={rentalMode === "ONLINE" ? "Thanh toán mô phỏng" : "Xác nhận đặt cọc"}
      okButtonProps={{ disabled: !cartHasValidPrices }}
      cancelText="Quay lại"
      onCancel={() => setRentalCheckoutOpen(false)}
      onOk={() => void confirmRentalCheckout()}
    >
      <p>{rentalMode === "ONLINE"
        ? `Thanh toán mô phỏng ${formatCurrency(total)} (70% giá sách) để đọc ebook trong 7 ngày. Quyền đọc sẽ tự khóa khi hết hạn. Không thu tiền thật.`
        : `Thanh toán/cọc mô phỏng ${formatCurrency(total)} (100% giá sách). Phí thuê ròng là 60%; nếu trả sách trước hoặc đúng hạn sẽ được ghi nhận hoàn 40% (${formatCurrency(totalRefund)}). Quá hạn thì mất toàn bộ khoản cọc. Không thu/hoàn tiền thật.`}</p>
    </Modal>
    <Modal
      title="Xác nhận mua sách và quyền đọc online"
      open={bookToBuy !== null}
      confirmLoading={checkingPurchase}
      okText="Mua và sở hữu"
      cancelText="Quay lại"
      onCancel={() => setBookToBuy(null)}
      onOk={() => void confirmPurchase()}
    >
      {bookToBuy && <p>{bookToBuy.title} — {formatCurrency(bookToBuy.salePrice ?? 0)}. Đơn mua đã thanh toán sẽ cấp quyền đọc online vô thời hạn. Thanh toán mô phỏng không trừ tiền thật. {bookToBuy.hasDigitalContent ? "Nội dung ebook đã sẵn sàng." : "Ebook chưa có nội dung; quyền đọc sẽ hoạt động sau khi quản trị viên bổ sung ebook có bản quyền."}</p>}
    </Modal>
  </div></App>;
}
