import dotenvx from "@dotenvx/dotenvx";
dotenvx.config();
import express from "express";
import http from "http";
import cors from "cors";
import morgan from "morgan";
import { prisma } from "./config/db.js";
import { createTerminus } from "@godaddy/terminus";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { ACTIONS_CORS_HEADERS_MIDDLEWARE, createPostResponse } from "@solana/actions";
import { uuidv7 } from "uuidv7";
import { renderBoard, initializeBoard, gameCanvas, board, numCols, numRows } from "./controller/board.js";

const PORT = process.env.PORT || 3000;
const DEFAULT_SOL_ADDRESS = new PublicKey(process.env.DEFAULT_SOL_ADDRESS);
const DEFAULT_SOL_AMOUNT = Number(process.env.DEFAULT_SOL_AMOUNT);
const connection = new Connection(clusterApiUrl("mainnet-beta"));
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const app = express();
app.set("trust proxy", 1);
app.use(morgan("tiny"));
app.use(cors(ACTIONS_CORS_HEADERS_MIDDLEWARE));
app.use(express.json());

app.get("/api/get-image", async (req, res) => {
  try {
    await initializeBoard();
    renderBoard();
    res.setHeader("Content-Type", "image/png");
    gameCanvas.createPNGStream().pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err?.message || err });
  }
});

app.post("/webhook", [adminAuthMiddleware], async (req, res) => {
  const payload = req.body;
  try {
    const logs = payload?.[0]?.meta?.logMessages;
    const txHash = payload?.[0]?.transaction?.signatures?.[0];
    const memoLog = logs.find((log) => log.includes("Program log: Memo "));
    const match = memoLog.match(/: "([^"]+)"/);
    if (!match) {
      console.log("Invalid input format", memoLog);
      res.status(400).json({ message: "Invalid input format" });
    }

    const parts = match[1].split(":");
    if (parts.length !== 2) {
      console.log("Invalid input format", memoLog);
      res.status(400).json({ message: "Invalid input format" });
    }
    const row = Number(String(parts[0]).charCodeAt(0) - 65);
    const col = Number(parts[1]);

    await initializeBoard();
    const roundId = await prisma.minesweeperRound.aggregate({
      _max: {
        id: true,
      },
    });

    await Promise.all([
      revealCell(roundId._max.id, row, col),
      prisma.minesweeperTxLog.create({
        data: {
          id: uuidv7(),
          tx: txHash,
          data: match[1],
          roundId: roundId._max.id,
        },
      }),
    ]);

    res.json({ message: "Webhook received successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err?.message || err });
  }
});

// For Blink Action
app.get("/actions.json", getActionsJson);
app.get("/api/actions/play", getPlayAction);
app.post("/api/actions/play", postPlayAction);
app.post("/api/actions/reset", resetGame);

// Route handlers
function getActionsJson(req, res) {
  const payload = {
    rules: [
      { pathPattern: "/*", apiPath: "/api/actions/*" },
      { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
    ],
  };
  res.json(payload);
}

async function getPlayAction(req, res) {
  try {
    if (board.length === 0) {
      await initializeBoard();
    }
    const isLose = board.some((row) => row.some((cell) => cell.revealed && cell.isMine));
    const payload = {
      title: "Solana Minesweeper",
      icon: `${BASE_URL}/api/get-image`,
      description: "Click, Reveal, and Win - Minesweeper on Solana Blink Awaits!",
      links: {
        actions: isLose
          ? [
              {
                label: "Reset Game",
                href: `${BASE_URL}/api/actions/reset`,
              },
            ]
          : [
              {
                label: "Play",
                href: `${BASE_URL}/api/actions/play?data={data}`,
                parameters: [
                  {
                    name: "data",
                    label: `Enter value. Eg: A:1 `,
                    required: true,
                  },
                ],
              },
            ],
      },
    };

    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err?.message || err });
  }
}

async function resetGame(req, res) {
  try {
    const toPubkey = DEFAULT_SOL_ADDRESS;
    const { data } = validatedQueryParams(req.query);
    const { account } = req.body;

    if (!account) {
      throw new Error('Invalid "account" provided');
    }

    const fromPubkey = new PublicKey(account);

    // create an instruction to transfer native SOL from one wallet to another
    const transferSolInstruction = SystemProgram.transfer({
      fromPubkey: fromPubkey,
      toPubkey: toPubkey,
      lamports: DEFAULT_SOL_AMOUNT * LAMPORTS_PER_SOL,
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    // create a legacy transaction
    const transaction = new Transaction({
      feePayer: fromPubkey,
      blockhash,
      lastValidBlockHeight,
    }).add(transferSolInstruction);

    transaction.add(
      new TransactionInstruction({
        keys: [{ pubkey: fromPubkey, isSigner: true, isWritable: true }],
        data: Buffer.from(data, "utf-8"),
        programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      }),
    );

    const payload = await createPostResponse({
      fields: {
        transaction,
        message: `Reset game successfully, please refresh the page to play.`,
      },
      // note: no additional signers are needed
      // signers: [],
    });

    // Reset game
    await prisma.minesweeperRound.create({
      data: {
        status: "PLAYING",
      },
    });
    await initializeBoard();

    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "An unknown error occurred" });
  }
}

async function postPlayAction(req, res) {
  try {
    const toPubkey = DEFAULT_SOL_ADDRESS;
    const { data } = validatedQueryParams(req.query);
    const { account } = req.body;

    if (!account) {
      throw new Error('Invalid "account" provided');
    }

    const fromPubkey = new PublicKey(account);

    // create an instruction to transfer native SOL from one wallet to another
    const transferSolInstruction = SystemProgram.transfer({
      fromPubkey: fromPubkey,
      toPubkey: toPubkey,
      lamports: DEFAULT_SOL_AMOUNT * LAMPORTS_PER_SOL,
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    // create a legacy transaction
    const transaction = new Transaction({
      feePayer: fromPubkey,
      blockhash,
      lastValidBlockHeight,
    }).add(transferSolInstruction);

    transaction.add(
      new TransactionInstruction({
        keys: [{ pubkey: fromPubkey, isSigner: true, isWritable: true }],
        data: Buffer.from(data, "utf-8"),
        programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      }),
    );

    const payload = await createPostResponse({
      fields: {
        transaction,
        message: `Successfully action, please refresh the page to see the changes.`,
      },
      // note: no additional signers are needed
      // signers: [],
    });

    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "An unknown error occurred" });
  }
}

function validatedQueryParams(query) {
  try {
    if (!query.data) {
      throw new Error("Missing required input query parameter: data");
    }
    const data = String(query.data).split(":");
    if (data.length !== 2) {
      throw new Error("Invalid input query parameter: data");
    }
  } catch (err) {
    throw new Error("Invalid input query parameter: data");
  }

  return { data: query.data };
}

async function revealCell(roundId, row, col) {
  try {
    if (!roundId) {
      throw new Error("Missing roundId");
    }
    if (board.some((row) => row.some((cell) => cell.revealed && cell.isMine))) {
      return;
    }
    if (row < 0 || row >= numRows || col < 0 || col >= numCols) {
      return;
    }
    if (board[row][col].revealed) {
      return;
    }

    board[row][col].revealed = true;

    if (board[row][col].isMine) {
      await prisma.$transaction([
        prisma.minesweeperBoard.update({
          where: {
            roundId_row_col: {
              roundId,
              row,
              col,
            },
          },
          data: {
            revealed: true,
          },
        }),
        prisma.minesweeperRound.update({
          where: {
            id: roundId,
          },
          data: {
            status: "LOST",
          },
        }),
      ]);
      return;
    } else if (board[row][col].count === 0) {
      // If cell has no mines nearby, reveal adjacent cells
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          await revealCell(roundId, row + dx, col + dy);
        }
      }
    }

    // Update cell in db
    await prisma.minesweeperBoard.update({
      where: {
        roundId_row_col: {
          roundId,
          row,
          col,
        },
      },
      data: {
        revealed: true,
      },
    });
  } catch (err) {
    console.error(err);
  }
}

function adminAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.header("authorization");
    if (authHeader === process.env.ADMIN_API_KEY) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized access" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err?.message || err });
  }
}

function onHealthCheck() {
  return Promise.resolve();
}

function onSignal() {
  console.log("server is starting cleanup");
  // close db connections, etc
  return Promise.all([
    prisma
      .$disconnect()
      .then(() => console.log("postgres disconnected successfully"))
      .catch((err) => console.error("error during postgres disconnection", err.stack)),
  ]);
}

function onShutdown() {
  console.log("cleanup finished, server is shutting down");
  return Promise.resolve();
}

const terminusOptions = {
  signals: ["SIGINT", "SIGTERM"],
  timeout: 10000,
  healthChecks: { "/": onHealthCheck },
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "OPTIONS, POST, GET",
  },
  onSignal,
  onShutdown,
};

const server = http.createServer(app);

// graceful shutdown
createTerminus(server, terminusOptions);

server.listen(PORT, () => {
  console.log(`Server is running on port :${PORT}`);
});
