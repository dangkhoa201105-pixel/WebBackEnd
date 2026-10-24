ALTER TABLE "Book"
ADD COLUMN "readerContent" TEXT,
ADD COLUMN "hasDigitalContent" BOOLEAN NOT NULL DEFAULT false;
