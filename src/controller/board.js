import { createCanvas } from "canvas";
import { prisma } from "../config/db.js";

export const numRows = 8;
export const numCols = 8;
export const numMines = 20;
const cellSize = 40;
const canvasSize = cellSize * (numRows + 1);
export let board = [];
export const gameCanvas = createCanvas(canvasSize, canvasSize);
const ctx = gameCanvas.getContext("2d");

export async function initializeBoard() {
  const round = await prisma.minesweeperRound.aggregate({
    _max: {
      id: true,
    },
  });
  const roundId = round._max.id;
  const boardData = await prisma.minesweeperBoard.findMany({
    where: {
      roundId: roundId,
    },
  });

  // If board data exists, load it
  if (boardData.length > 0) {
    boardData.forEach((cell) => {
      if (!board[cell.row]) {
        board[cell.row] = [];
      }
      board[cell.row][cell.col] = {
        isMine: cell.isMine,
        revealed: cell.revealed,
        count: cell.count,
      };
    });
    return;
  }

  // Initialize board
  for (let i = 0; i < numRows; i++) {
    board[i] = [];
    for (let j = 0; j < numCols; j++) {
      board[i][j] = {
        isMine: false,
        revealed: false,
        count: 0,
      };
    }
  }

  // Place mines randomly
  let minesPlaced = 0;
  while (minesPlaced < numMines) {
    const row = Math.floor(Math.random() * numRows);
    const col = Math.floor(Math.random() * numCols);
    if (!board[row][col].isMine) {
      board[row][col].isMine = true;
      minesPlaced++;
    }
  }

  // Calculate counts
  for (let i = 0; i < numRows; i++) {
    for (let j = 0; j < numCols; j++) {
      if (!board[i][j].isMine) {
        let count = 0;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const ni = i + dx;
            const nj = j + dy;
            if (ni >= 0 && ni < numRows && nj >= 0 && nj < numCols && board[ni][nj].isMine) {
              count++;
            }
          }
        }
        board[i][j].count = count;
      }
    }
  }

  await prisma.minesweeperBoard.createMany({
    data: board
      .map((row, i) =>
        row.map((cell, j) => ({
          roundId,
          row: i,
          col: j,
          isMine: cell.isMine,
          count: cell.count,
        })),
      )
      .flat(),
    skipDuplicates: true,
  });
}

export function renderBoard() {
  ctx.clearRect(0, 0, canvasSize, canvasSize);

  // Draw row and column labels
  ctx.font = '22px "Apple"';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Row labels (numbers)
  for (let i = 0; i < numRows; i++) {
    ctx.fillText(i, cellSize / 2, cellSize * (i + 1.5));
  }

  // Column labels (uppercase alphabets)
  for (let j = 0; j < numCols; j++) {
    ctx.fillText(String.fromCharCode(65 + j), cellSize * (j + 1.5), cellSize / 2);
  }

  // Draw cells
  for (let i = 0; i < numRows; i++) {
    for (let j = 0; j < numCols; j++) {
      const cellX = (j + 1) * cellSize;
      const cellY = (i + 1) * cellSize;
      ctx.strokeRect(cellX, cellY, cellSize, cellSize);

      if (board[i][j].revealed) {
        if (board[i][j].isMine) {
          ctx.fillStyle = "red";
          ctx.fillRect(cellX, cellY, cellSize, cellSize);
          ctx.fillStyle = "black";
          ctx.fillText("x", cellX + cellSize / 2, cellY + cellSize / 2);
        } else if (board[i][j].count > 0) {
          ctx.fillStyle = "lightgrey";
          ctx.fillRect(cellX, cellY, cellSize, cellSize);
          ctx.fillStyle = "black";
          ctx.fillText(board[i][j].count, cellX + cellSize / 2, cellY + cellSize / 2);
        } else {
          ctx.fillStyle = "lightgrey";
          ctx.fillRect(cellX, cellY, cellSize, cellSize);
        }
      }
    }
  }
}

/*
// reveal cell when clicked
function revealCell(row, col) {
  if (row < 0 || row >= numRows || col < 0 || col >= numCols || board[row][col].revealed) {
    return;
  }

  board[row][col].revealed = true;

  if (board[row][col].isMine) {
    // Handle game over
    alert("Game Over! You stepped on a mine.");
  } else if (board[row][col].count === 0) {
    // If cell has no mines nearby, reveal adjacent cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        revealCell(row + dx, col + dy);
      }
    }
  }

  renderBoard();
}

// add click event listener to canvas
gameCanvas.addEventListener("click", (event) => {
  const rect = gameCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const row = Math.floor(y / cellSize) - 1;
  const col = Math.floor(x / cellSize) - 1;

  if (row >= 0 && col >= 0 && row < numRows && col < numCols) {
    revealCell(row, col);
  }
});
*/
