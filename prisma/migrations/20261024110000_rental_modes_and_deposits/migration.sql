CREATE TYPE "RentalMode" AS ENUM ('ONLINE', 'OFFLINE');
ALTER TYPE "RentalStatus" ADD VALUE 'EXPIRED';

ALTER TABLE "Rental"
ADD COLUMN "rentalMode" "RentalMode" NOT NULL DEFAULT 'OFFLINE',
ADD COLUMN "amountPaid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "refundableDeposit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "refundedAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "refundedAt" TIMESTAMP(3),
ADD COLUMN "depositForfeitedAt" TIMESTAMP(3);

ALTER TABLE "Rental"
ADD CONSTRAINT "Rental_amountPaid_nonnegative_check" CHECK ("amountPaid" >= 0),
ADD CONSTRAINT "Rental_refundableDeposit_nonnegative_check" CHECK ("refundableDeposit" >= 0),
ADD CONSTRAINT "Rental_refundedAmount_nonnegative_check" CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "refundableDeposit");
