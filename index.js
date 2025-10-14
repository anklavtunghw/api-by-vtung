const Fastify = require("fastify");
const WebSocket = require("ws");

const app = Fastify({ logger: false });
const PORT = process.env.PORT || 10000;

let sessions = [];

// === TOKEN MỚI ===
const TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJkdW91YnVvaWJzYnN2c3YiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjoyNzY1NDI0NDgsImFmZklkIjoiU3Vud2luIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJzdW4ud2luIiwidGltZXN0YW1wIjoxNzYwNDM3MjI5MTk4LCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjExNi45Ny4xMDguMTkzIiwibXV0ZSI6ZmFsc2UsImF2YXRhciI6Imh0dHBzOi8vaW1hZ2VzLnN3aW5zaG9wLm5ldC9pbWFnZXMvYXZhdGFyL2F2YXRhcl8xOS5wbmciLCJwbGF0Zm9ybUlkIjo1LCJ1c2VySWQiOiI4ZGE3YWYwMS0wZjJiLTRhMDItODA0NS1iZjMxNTk5ZTNhNTQiLCJyZWdUaW1lIjoxNzUyMDYzNDgyNTAyLCJwaG9uZSI6IiIsImRlcG9zaXQiOmZhbHNlLCJ1c2VybmFtZSI6IlNDX3ZmeWFiZ3NzayJ9.87cIVjwyslsgngISFoJPVgoIedG2CXIEljNYYOruBKo";

// === KẾT NỐI WEBSOCKET SUNWIN ===
function connectWebSocket() {
  const ws = new WebSocket(`wss://websocket.azhkthg1.net/wsbinary?token=${TOKEN}`, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Origin": "https://azhkthg1.net"
    }
  });

  ws.on("open", () => {
    console.log("🟢 Đã kết nối WebSocket Sunwin");

    // ⚙️ Payload mới (theo token bạn cung cấp)
    const authPayload = [
      1, "MiniGame", "duoubuoibsvsv", "", {
        info: JSON.stringify({
          ipAddress: "116.97.108.193",
          userId: "8da7af01-0f2b-4a02-8045-bf31599e3a54",
          username: "SC_vfyabgssk"
        }),
        signature: "AUTO_TOKEN_MODE"
      }
    ];

    ws.send(JSON.stringify(authPayload));

    // Gửi yêu cầu dữ liệu mỗi 5s
    setInterval(() => {
      ws.send(JSON.stringify([6, "MiniGame", "taixiuPlugin", { cmd: 1005 }]));
    }, 5000);
  });

  ws.on("message", (data) => {
    const raw = data.toString();
    console.log("📩 RAW WS:", raw.slice(0, 200));

    try {
      const json = JSON.parse(raw);
      const htr = json?.[1]?.htr;

      if (Array.isArray(htr)) {
        for (const item of htr) {
          if (!sessions.find(s => s.sid === item.sid)) {
            const total = item.d1 + item.d2 + item.d3;
            const result = total >= 11 ? "Tài" : "Xỉu";

            const session = {
              sid: item.sid,
              d1: item.d1,
              d2: item.d2,
              d3: item.d3,
              total,
              result,
              timestamp: Date.now()
            };

            sessions.unshift(session);
            if (sessions.length > 500) sessions.pop();

            console.log(`📥 Phiên ${session.sid}: ${session.d1}-${session.d2}-${session.d3} = ${session.total} → ${session.result}`);
          }
        }
      }
    } catch (err) {
      console.error("❌ Lỗi WS:", err.message);
    }
  });

  ws.on("close", () => {
    console.warn("🔌 WS đóng. Kết nối lại sau 5s...");
    setTimeout(connectWebSocket, 5000);
  });

  ws.on("error", (err) => {
    console.error("⚠️ Lỗi WS:", err.message);
    ws.close();
  });
}

connectWebSocket();

// === ROUTE API CHUẨN ===
app.get("/", async () => ({
  message: "✅ Sunwin API đang hoạt động",
  endpoints: ["/api/toolaxosun", "/api/last", "/api/history?limit=50"]
}));

app.get("/api/toolaxosun", async () => {
  const latest = sessions[0];
  if (!latest) return { message: "⛔ Chưa có dữ liệu" };

  return {
    phien_cu: latest.sid,
    ket_qua: latest.result,
    xuc_xac: [latest.d1, latest.d2, latest.d3],
    phien_moi: latest.sid + 1
  };
});

app.get("/api/last", async () => {
  const latest = sessions[0];
  if (!latest) return { message: "⛔ Chưa có dữ liệu" };
  return {
    sid: latest.sid,
    dices: [latest.d1, latest.d2, latest.d3],
    total: latest.total,
    result: latest.result,
    timestamp: latest.timestamp
  };
});

app.get("/api/history", async (req) => {
  const limit = parseInt(req.query.limit || "50");
  return sessions.slice(0, limit);
});

// === KHỞI CHẠY SERVER ===
app.listen({ port: PORT, host: "0.0.0.0" }, () => {
  console.log(`🚀 API chạy tại http://localhost:${PORT}`);
});
