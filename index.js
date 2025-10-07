import express from "express";
import WebSocket from "ws";

const APP_PORT = process.env.PORT || 3000;
const WSS_URL = process.env.UPSTREAM_WSS || "wss://carkgwaiz.hytsocesk.com/websocket";
const USER_TOKEN = process.env.USER_TOKEN || "0f7ca69e2dc95935a2e868a2726ba0a3"; // bạn có thể thay hoặc set env

const SERVICE_ID = "anklavtunghw";

let last = { status: "waiting for data..." };        // /taixiu
let lastWithMd5 = { status: "waiting for data..." }; // /taixiumd5

let ws = null;
let reconnectDelay = 1000;
let manuallyClosed = false;

function safeParse(msg) {
  try { return JSON.parse(msg.toString()); }
  catch(e) { return null; }
}

// Tìm trong payload các trường khả dĩ chứa info
function extractRoundInfo(obj) {
  // possible shapes:
  // 1) { game: "taixiu", phien: 123, result: [1,2,3], md5: "..." }
  // 2) { event: "...", data: { roundId: 123, result: [..], md5: "..." } }
  // 3) { type: "round", data: {...} }
  if (!obj) return null;

  // try top-level
  if (obj.game === "taixiu" && Array.isArray(obj.result)) {
    const [a,b,c] = obj.result;
    const total = (a||0)+(b||0)+(c||0);
    return {
      phien: obj.phien ?? obj.round ?? obj.roundId ?? obj.id ?? null,
      dice: [a,b,c],
      total,
      result: total >= 11 ? "Tài" : "Xỉu",
      md5: obj.md5 ?? null
    };
  }

  // try nested data
  const data = obj.data ?? obj.payload ?? null;
  if (data) {
    // common keys
    if (Array.isArray(data.result)) {
      const [a,b,c] = data.result;
      const total = (a||0)+(b||0)+(c||0);
      return {
        phien: data.phien ?? data.round ?? data.roundId ?? data.id ?? null,
        dice: [a,b,c],
        total,
        result: total >= 11 ? "Tài" : "Xỉu",
        md5: data.md5 ?? null
      };
    }

    // sometimes result is under data.dice or data.xucxac
    const maybeDice = data.dice ?? data.xucxac ?? data.values ?? null;
    if (Array.isArray(maybeDice) && maybeDice.length >= 3) {
      const [a,b,c] = maybeDice;
      const total = (a||0)+(b||0)+(c||0);
      return {
        phien: data.phien ?? data.round ?? data.roundId ?? data.id ?? null,
        dice: [a,b,c],
        total,
        result: total >= 11 ? "Tài" : "Xỉu",
        md5: data.md5 ?? null
      };
    }
  }

  // try deeper scanning: look for any array of length 3 with values 1..6
  function findDice(o) {
    if (!o || typeof o !== "object") return null;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (Array.isArray(v) && v.length >= 3 && v.every(n => Number.isInteger(n) && n >= 1 && n <= 6)) {
        return { dice: [v[0], v[1], v[2]], sourceKey: k };
      }
      if (typeof v === "object") {
        const found = findDice(v);
        if (found) return found;
      }
    }
    return null;
  }
  const found = findDice(obj);
  if (found) {
    const [a,b,c] = found.dice;
    const total = a+b+c;
    // attempt to find md5 nearby
    const md5 = obj.md5 ?? (obj.data && obj.data.md5) ?? null;
    const phien = obj.phien ?? (obj.data && (obj.data.phien || obj.data.roundId)) ?? null;
    return { phien, dice: [a,b,c], total, result: total >=11 ? "Tài" : "Xỉu", md5 };
  }

  return null;
}

function connect() {
  console.log(`[WSS] connecting to ${WSS_URL}`);
  ws = new WebSocket(WSS_URL, {
    handshakeTimeout: 8000
  });

  ws.on("open", () => {
    console.log("[WSS] open");
    reconnectDelay = 1000;

    // send login / auth if required
    // many servers expect a login + subscribe pattern — adjust if WSS expects different keys
    const loginPacket = {
      event: "login",
      data: {
        userToken: USER_TOKEN,
        clientType: 2
      }
    };
    try {
      ws.send(JSON.stringify(loginPacket));
      console.log("[WSS] sent login packet");
    } catch(e){ console.warn("[WSS] login send error", e.message); }

    // send subscribe to taixiu channel
    const sub = {
      event: "subscribe",
      data: { game: "taixiu" }
    };
    try {
      ws.send(JSON.stringify(sub));
      console.log("[WSS] sent subscribe packet");
    } catch(e){ console.warn("[WSS] subscribe send error", e.message); }
  });

  ws.on("message", (msg) => {
    // log raw for debugging
    const raw = msg.toString();
    // uncomment next line to see all frames:
    // console.log("[WSS RAW]", raw);

    const obj = safeParse(raw);
    if (!obj) {
      // not JSON — ignore or log
      // console.log("[WSS] non-JSON frame:", raw.slice(0,200));
      return;
    }

    // try to extract round info
    const info = extractRoundInfo(obj);
    if (info) {
      const out = {
        id: SERVICE_ID,
        phien: info.phien,
        xucxac_1: info.dice[0],
        xucxac_2: info.dice[1],
        xucxac_3: info.dice[2],
        tong: info.total,
        ketqua: info.result,
        time: new Date().toISOString()
      };
      last = out;
      lastWithMd5 = { ...out, md5: info.md5 ?? null };
      console.log("[WSS] new round:", lastWithMd5);
      return;
    }

    // else if the message wraps an array of events, scan each
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const info2 = extractRoundInfo(item);
        if (info2) {
          const out2 = {
            id: SERVICE_ID,
            phien: info2.phien,
            xucxac_1: info2.dice[0],
            xucxac_2: info2.dice[1],
            xucxac_3: info2.dice[2],
            tong: info2.total,
            ketqua: info2.result,
            time: new Date().toISOString()
          };
          last = out2;
          lastWithMd5 = { ...out2, md5: info2.md5 ?? null };
          console.log("[WSS] new round (array):", lastWithMd5);
          break;
        }
      }
    }
  });

  ws.on("close", (code, reason) => {
    console.warn(`[WSS] closed ${code} ${reason ? reason.toString() : ""}`);
    if (manuallyClosed) return;
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
      connect();
    }, reconnectDelay);
  });

  ws.on("error", (err) => {
    console.error("[WSS] error:", err.message);
    try { ws.terminate(); } catch(e) {}
  });

  // optional ping-pong (if remote expects)
  ws.on("ping", () => {
    try { ws.pong(); } catch(e) {}
  });
}

connect();

// Express API
const app = express();

app.get("/taixiu", (req, res) => {
  res.json(last);
});

app.get("/taixiumd5", (req, res) => {
  res.json(lastWithMd5);
});

app.get("/", (req, res) => {
  res.json({ status: "ok", notice: "use /taixiu and /taixiumd5" });
});

app.listen(APP_PORT, () => {
  console.log(`API listening on port ${APP_PORT}`);
});
