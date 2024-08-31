import bs58 from "bs58";
import fs from "fs";

function writeKeyToFile(privatekey) {
  const b = bs58.decode(privatekey);
  const j = new Uint8Array(b.buffer, b.byteOffset, b.byteLength / Uint8Array.BYTES_PER_ELEMENT);
  fs.writeFileSync("privatekey.json", `[${j}]`);
}
