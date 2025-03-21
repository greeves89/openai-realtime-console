import express from "express";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import "dotenv/config";
import pkg from 'twilio';
const { twiml: Twiml } = pkg;

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

// Configure Vite middleware for React client
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
});

// Twilio Webhook-Endpoint
app.post("/twilio/voice", express.urlencoded({ extended: false }), (req, res) => {
  const voiceResponse = new Twiml.VoiceResponse();

  // Mit <Connect> wird der Anruf direkt verbunden und der Audio-Stream gestartet.
  const connect = voiceResponse.connect();
  connect.stream({
    url: 'wss://daniel-alisch.site/twilio/audio-stream'
  });

  res.type('text/xml');
  res.send(voiceResponse.toString());
});

// Bypass für alle Anfragen, die mit /twilio beginnen – diese sollen nicht von Vite behandelt werden.
app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/twilio")) {
    return next();
  }
  vite.middlewares(req, res, next);
});

// API route for token generation
app.get("/token", async (req, res) => {
  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "verse",
        }),
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// Catch-All-Route: Rendert den React-Client
app.use("*", async (req, res, next) => {
  const url = req.originalUrl;

  try {
    const template = await vite.transformIndexHtml(
      url,
      fs.readFileSync("./client/index.html", "utf-8")
    );
    const { render } = await vite.ssrLoadModule("./client/entry-server.jsx");
    const appHtml = await render(url);
    const html = template.replace(`<!--ssr-outlet-->`, appHtml?.html);
    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  } catch (e) {
    vite.ssrFixStacktrace(e);
    next(e);
  }
});

app.listen(port, () => {
  console.log(`Express server running on *:${port}`);
});