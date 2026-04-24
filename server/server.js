import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "..", ".env");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(envPath);

const app = express();
const port = process.env.PORT || 8787;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

function dataUrlToBlob(dataUrl) {
  const [meta, content] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] ?? "image/png";
  const buffer = Buffer.from(content, "base64");
  return new Blob([buffer], { type: mime });
}

async function telegramRequest(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }

  return response.json();
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    telegramReady: Boolean(botToken && adminChatId)
  });
});

app.post("/api/orders", async (request, response) => {
  const order = request.body;

  if (!order?.orderId || !order?.telegram || !order?.frontComposite || !order?.backComposite) {
    response.status(400).json({ ok: false, error: "Invalid payload" });
    return;
  }

  if (!botToken || !adminChatId) {
    response.status(202).json({
      ok: true,
      sent: false,
      reason: "Telegram credentials are missing"
    });
    return;
  }

  try {
    const message = [
      `New order: ${order.orderId}`,
      `Date: ${order.dateLabel}`,
      `Color: ${order.colorLabel}`,
      `Telegram: ${order.telegram}`
    ].join("\n");

    const textBody = new URLSearchParams({
      chat_id: adminChatId,
      text: message
    });

    await telegramRequest("sendMessage", textBody);

    const frontBody = new FormData();
    frontBody.append("chat_id", adminChatId);
    frontBody.append("caption", `${order.orderId} / Front`);
    frontBody.append(
      "photo",
      dataUrlToBlob(order.frontComposite),
      `${order.orderId}-front.png`
    );
    await telegramRequest("sendPhoto", frontBody);

    const backBody = new FormData();
    backBody.append("chat_id", adminChatId);
    backBody.append("caption", `${order.orderId} / Back`);
    backBody.append(
      "photo",
      dataUrlToBlob(order.backComposite),
      `${order.orderId}-back.png`
    );
    await telegramRequest("sendPhoto", backBody);

    if (order.frontPrint?.dataUrl) {
      const frontPrintBody = new FormData();
      frontPrintBody.append("chat_id", adminChatId);
      frontPrintBody.append(
        "document",
        dataUrlToBlob(order.frontPrint.dataUrl),
        order.frontPrint.name || `${order.orderId}-front-print.png`
      );
      await telegramRequest("sendDocument", frontPrintBody);
    }

    if (order.backPrint?.dataUrl) {
      const backPrintBody = new FormData();
      backPrintBody.append("chat_id", adminChatId);
      backPrintBody.append(
        "document",
        dataUrlToBlob(order.backPrint.dataUrl),
        order.backPrint.name || `${order.orderId}-back-print.png`
      );
      await telegramRequest("sendDocument", backPrintBody);
    }

    response.json({ ok: true, sent: true });
  } catch (error) {
    console.error(error);
    response.status(500).json({ ok: false, error: "Telegram send failed" });
  }
});

app.listen(port, () => {
  console.log(`Telegram server is running on http://localhost:${port}`);
});
