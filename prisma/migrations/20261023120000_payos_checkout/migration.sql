ALTER TYPE "OrderStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "PaymentMethod" ADD VALUE 'PAYOS';

ALTER TABLE "Order"
ADD COLUMN "paymentOrderCode" INTEGER,
ADD COLUMN "paymentLinkId" TEXT,
ADD COLUMN "checkoutUrl" TEXT,
ADD COLUMN "paymentExpiresAt" TIMESTAMP(3),
ADD COLUMN "paymentReference" TEXT,
ADD COLUMN "paidAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Order_paymentOrderCode_key" ON "Order"("paymentOrderCode");
CREATE UNIQUE INDEX "Order_paymentLinkId_key" ON "Order"("paymentLinkId");
