CREATE TYPE "CopyStatus" AS ENUM ('AVAILABLE', 'ON_LOAN', 'RESERVED', 'DAMAGED', 'LOST', 'MAINTENANCE', 'DISPOSED');
CREATE TYPE "ReservationStatus" AS ENUM ('WAITING', 'READY', 'FULFILLED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "InventoryMovementType" AS ENUM ('INTAKE', 'ADJUSTMENT', 'LOAN', 'RETURN', 'RESERVED', 'RESERVATION_RELEASE', 'DAMAGED', 'LOST', 'REPAIRED', 'DISPOSED', 'BOOK_SALE', 'SALE_RETURN');
CREATE TYPE "NotificationType" AS ENUM ('RESERVATION_READY', 'DUE_SOON', 'OVERDUE');
CREATE TYPE "SecurityAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "BookCopy" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "status" "CopyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "notes" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookCopy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "copyId" TEXT,
    "actorId" TEXT,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "copyId" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'WAITING',
    "readyUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReadingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlyReadingGoal" INTEGER NOT NULL DEFAULT 4,
    "preferredCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReadingProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "referenceId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityAlert" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" "SecurityAlertStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Rental" ADD COLUMN "copyId" TEXT;
CREATE INDEX "Rental_copyId_status_idx" ON "Rental"("copyId", "status");

CREATE UNIQUE INDEX "BookCopy_barcode_key" ON "BookCopy"("barcode");
CREATE INDEX "BookCopy_bookId_status_idx" ON "BookCopy"("bookId", "status");
CREATE INDEX "InventoryMovement_bookId_createdAt_idx" ON "InventoryMovement"("bookId", "createdAt");
CREATE INDEX "InventoryMovement_copyId_createdAt_idx" ON "InventoryMovement"("copyId", "createdAt");
CREATE INDEX "InventoryMovement_actorId_createdAt_idx" ON "InventoryMovement"("actorId", "createdAt");
CREATE INDEX "Reservation_bookId_status_createdAt_idx" ON "Reservation"("bookId", "status", "createdAt");
CREATE INDEX "Reservation_userId_status_createdAt_idx" ON "Reservation"("userId", "status", "createdAt");
CREATE INDEX "Reservation_copyId_status_idx" ON "Reservation"("copyId", "status");
CREATE UNIQUE INDEX "ReadingProfile_userId_key" ON "ReadingProfile"("userId");
CREATE UNIQUE INDEX "Notification_userId_type_referenceId_key" ON "Notification"("userId", "type", "referenceId");
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE UNIQUE INDEX "SecurityAlert_dedupeKey_key" ON "SecurityAlert"("dedupeKey");
CREATE INDEX "SecurityAlert_status_createdAt_idx" ON "SecurityAlert"("status", "createdAt");
CREATE INDEX "SecurityAlert_type_createdAt_idx" ON "SecurityAlert"("type", "createdAt");

ALTER TABLE "BookCopy" ADD CONSTRAINT "BookCopy_bookId_fkey"
FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_bookId_fkey"
FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_copyId_fkey"
FOREIGN KEY ("copyId") REFERENCES "BookCopy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_bookId_fkey"
FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_copyId_fkey"
FOREIGN KEY ("copyId") REFERENCES "BookCopy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReadingProfile" ADD CONSTRAINT "ReadingProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityAlert" ADD CONSTRAINT "SecurityAlert_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_copyId_fkey"
FOREIGN KEY ("copyId") REFERENCES "BookCopy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

WITH counts AS (
    SELECT b."id", b."stock", b."available",
        (SELECT COUNT(*)::INTEGER FROM "Rental" r WHERE r."bookId" = b."id" AND r."status" = 'ACTIVE') AS active_count,
        GREATEST(b."stock", b."available" + (SELECT COUNT(*)::INTEGER FROM "Rental" r WHERE r."bookId" = b."id" AND r."status" = 'ACTIVE')) AS copy_count
    FROM "Book" b
),
generated AS (
    SELECT c."id" AS "bookId", c."available", n AS ordinal,
        'legacy_' || md5(c."id" || ':' || n::TEXT) AS copy_id,
        'LEG-' || upper(md5(c."id" || ':' || n::TEXT)) AS barcode
    FROM counts c
    CROSS JOIN LATERAL generate_series(1, c.copy_count) AS n
)
INSERT INTO "BookCopy" ("id", "bookId", "barcode", "status", "condition", "acquiredAt", "createdAt", "updatedAt")
SELECT copy_id, "bookId", barcode, 'AVAILABLE', 'GOOD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM generated;

WITH ranked_copies AS (
    SELECT c."id", c."bookId",
        row_number() OVER (PARTITION BY c."bookId" ORDER BY c."barcode") AS ordinal
    FROM "BookCopy" c
),
ranked_rentals AS (
    SELECT r."id", r."bookId",
        row_number() OVER (PARTITION BY r."bookId" ORDER BY r."createdAt", r."id") AS ordinal
    FROM "Rental" r
    WHERE r."status" = 'ACTIVE'
),
assignments AS (
    SELECT rr."id" AS "rentalId", rc."id" AS "copyId"
    FROM ranked_rentals rr
    JOIN "Book" b ON b."id" = rr."bookId"
    JOIN ranked_copies rc ON rc."bookId" = rr."bookId" AND rc.ordinal = b."available" + rr.ordinal
)
UPDATE "Rental" r SET "copyId" = a."copyId"
FROM assignments a WHERE r."id" = a."rentalId";

UPDATE "BookCopy" c SET "status" = 'ON_LOAN', "condition" = 'ON_LOAN'
FROM "Rental" r WHERE r."copyId" = c."id" AND r."status" = 'ACTIVE';

INSERT INTO "InventoryMovement" ("id", "bookId", "type", "quantity", "notes", "createdAt")
SELECT 'migration_' || md5(b."id"), b."id", 'ADJUSTMENT',
       (SELECT COUNT(*)::INTEGER FROM "BookCopy" c WHERE c."bookId" = b."id"),
       'Initial physical copies created from legacy stock; existing active loans linked where possible.',
       CURRENT_TIMESTAMP
FROM "Book" b;

UPDATE "Book" b SET
    "stock" = (SELECT COUNT(*)::INTEGER FROM "BookCopy" c WHERE c."bookId" = b."id" AND c."status" NOT IN ('LOST', 'DISPOSED')),
    "available" = (SELECT COUNT(*)::INTEGER FROM "BookCopy" c WHERE c."bookId" = b."id" AND c."status" = 'AVAILABLE');

CREATE UNIQUE INDEX "Rental_active_copyId_key" ON "Rental"("copyId") WHERE "status" = 'ACTIVE' AND "copyId" IS NOT NULL;
CREATE UNIQUE INDEX "Reservation_one_active_user_book_key" ON "Reservation"("userId", "bookId") WHERE "status" IN ('WAITING', 'READY');
CREATE UNIQUE INDEX "Reservation_ready_copyId_key" ON "Reservation"("copyId") WHERE "status" = 'READY' AND "copyId" IS NOT NULL;
