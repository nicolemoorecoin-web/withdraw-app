const express = require("express");
const path = require("path");
const morgan = require("morgan");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

// middleware
app.use(morgan("tiny"));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// health check
app.get("/health", (req, res) => res.json({ ok: true }));

// simple log endpoint (extend later for emails, DB writes, webhooks, etc.)
app.post("/api/log", (req, res) => {
  const { event = "unknown", data = {} } = req.body || {};
  console.log(`[LOG] ${event}`, data);
  res.json({ status: "logged" });
});

// default route -> withdraw page
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "withdraw.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
