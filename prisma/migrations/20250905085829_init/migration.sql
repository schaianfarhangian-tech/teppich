-- CreateTable
CREATE TABLE "Rug" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rugNumber" TEXT NOT NULL,
    "name" TEXT,
    "widthCm" INTEGER NOT NULL,
    "lengthCm" INTEGER NOT NULL,
    "color" TEXT,
    "priceCents" INTEGER NOT NULL,
    "imagePath" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Rug_rugNumber_key" ON "Rug"("rugNumber");
