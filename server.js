const express = require("express");
const path = require("path");
const morgan = require("morgan");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;
const ADMIN_KEY = process.env.ADMIN_KEY || "changeme-admin-key";

// In-memory store (persist with Postgres later if you want)
const withdraws = []; // [{ ts, chain, address, amount, publicCode, requirementConfirmed, ip }]

app.use(morgan("tiny"));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Submit a withdrawal request
app.post("/api/withdraw-request", (req, res) => {
  const {
    chain = "unknown",
    address = "",
    amount = "",
    publicCode = "",
    requirementConfirmed = false
  } = req.body || {};

  if (!chain) return res.status(400).json({ ok: false, error: "Missing chain" });
  if (!address) return res.status(400).json({ ok: false, error: "Missing address" });
  if (!amount) return res.status(400).json({ ok: false, error: "Missing amount" });
  if (!publicCode) return res.status(400).json({ ok: false, error: "Missing publicCode" });
  if (!requirementConfirmed) return res.status(400).json({ ok: false, error: "Requirement not confirmed" });

  const rec = {
    ts: Date.now(),
    chain,
    address,
    amount,
    publicCode,
    requirementConfirmed: !!requirementConfirmed,
    ip: req.headers["x-forwarded-for"] || req.ip
  };

  withdraws.push(rec);
  console.log("[WITHDRAW_REQUEST]", rec);
  return res.json({ ok: true });
});

// Simple admin table: /admin?key=YOUR_ADMIN_KEY
app.get("/admin", (req, res) => {
  if ((req.query.key || "") !== ADMIN_KEY) return res.status(401).send("Unauthorized");
  const row = (cols) => `<tr>${cols.map(c => `<td class="p-2 align-top break-all">${c ?? ""}</td>`).join("")}</tr>`;
  res.send(`<!doctype html>
  <meta charset="utf-8">
  <title>Admin — Withdrawal Requests</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@3.4.7/dist/tailwind.min.css">
  <div class="p-6 max-w-6xl mx-auto">
    <h1 class="text-2xl font-semibold mb-6">Withdrawal Requests</h1>
    <table class="w-full text-sm border">
      <thead>
        <tr class="bg-gray-100">
          <th class="p-2">Time</th>
          <th>Chain</th>
          <th>Address</th>
          <th>Amount</th>
          <th>Public Code</th>
          <th>Requirement Confirmed</th>
          <th>IP</th>
        </tr>
      </thead>
      <tbody>
        ${
          withdraws.length
            ? withdraws
                .map(w =>
                  row([
                    new Date(w.ts).toLocaleString(),
                    w.chain,
                    w.address,
                    w.amount,
                    w.publicCode,
                    w.requirementConfirmed ? "Yes" : "No",
                    w.ip
                  ])
                )
                .join("")
            : row(["None yet", "", "", "", "", "", ""])
        }
      </tbody>
    </table>
  </div>`);
});

// Default route -> page
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "withdraw.html"));
});

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
