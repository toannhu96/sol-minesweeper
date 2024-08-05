-- CreateTable
CREATE TABLE "minesweeper_boards" (
    "roundId" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "isMine" BOOLEAN NOT NULL,
    "revealed" BOOLEAN NOT NULL DEFAULT FALSE,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "minesweeper_boards_pkey" PRIMARY KEY ("roundId","row","col")
);

-- CreateTable
CREATE TABLE "minesweeper_rounds" (
    "id" SERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLAYING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "minesweeper_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "minesweeper_tx_logs" (
    "id" TEXT NOT NULL,
    "tx" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "roundId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "minesweeper_tx_logs_pkey" PRIMARY KEY ("id")
);
