import express from "express";
import WebSocket from "ws";

const app = express();
const PORT = process.env.PORT || 3000;
const ID = "anklavtunghw";

let lastResult = { status: "waiting for data..." };
let lastMd5Result = { status: "waiting for data..." };

let ws;

function connectWSS() {
  ws = new WebSocket("wss://carkgwaiz.hytsocesk.com/websocket");

  ws.on("open", () => {
    console.log("[WSS] ✅ Connected to hit.club");
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      // Ví dụ: { game: "taixiu", phien: 123456, result: [2,6,3], md5: "abc..." }
      if (data.game === "taixiu" && Array.isArray(data.result)) {
        const [x1, x2, x3] = data.result;
        const tong = x1 + x2 + x3;
        const ketqua = tong >= 11 ? "Tài" : "Xỉu";

        lastResult = {
          id: ID,
          phien: data.phien,
          xucxac_1: x1,
          xucxac_2: x2,
          xucxac_3: x3,
          tong,
          ketqua,
          time: new Date().toISOString(),
        };

        lastMd5Result = {
          ...lastResult,
          md5: data.md5 || "unknown",
        };

        console.log("[NEW RESULT]", lastMd5Result);
      }
    } catch (err) {
      console.error("[Parse Error]", err.message);
    }
  });

  ws.on("close", () => {
    console.log("[WSS] ❌ Disconnected — reconnecting in 5s...");
    setTimeout(connectWSS, 5000);
  });

  ws.on("error", (err) => {
    console.error("[WSS Error]", err.message);
  });
}

connectWSS();

// 🟢 API 1: /taixiu
app.get("/taixiu", (req, res) => {
  res.json(lastResult);
});

// 🟢 API 2: /taixiumd5
app.get("/taixiumd5", (req, res) => {
  res.json(lastMd5Result);
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
