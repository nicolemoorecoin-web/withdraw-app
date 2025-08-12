const express = require("express");
const path = require("path");
const morgan = require("morgan");
const cors = require("cors");
const { randomUUID } = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;
const ADMIN_KEY = process.env.ADMIN_KEY || "changeme-admin-key";

// In-memory stores (use Postgres later for persistence)
const withdraws = [];   // [{ ts, chain, address, amount, publicCode, requirementConfirmed, ip, receiptId, status }]
const receipts  = new Map(); // id -> receipt object

app.use(morgan("tiny"));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Submit a withdrawal request -> returns a receipt id
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

  const id = randomUUID();
  const rec = {
    receiptId: id,
    status: "Pending",
    ts: Date.now(),
    chain,
    address,
    amount,
    publicCode,
    requirementConfirmed: !!requirementConfirmed,
    ip: req.headers["x-forwarded-for"] || req.ip
  };

  withdraws.push(rec);
  receipts.set(id, rec);
  console.log("[WITHDRAW_REQUEST]", rec);

  return res.json({ ok: true, receiptId: id, url: `/receipt/${id}` });
});

// JSON lookup (optional, if you want AJAX checks)
app.get("/api/receipt/:id", (req, res) => {
  const r = receipts.get(req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, receipt: r });
});

// HTML receipt page
app.get("/receipt/:id", (req, res) => {
  const r = receipts.get(req.params.id);
  if (!r) return res.status(404).send("Receipt not found");

  const fmt = (n) => (Math.round(parseFloat(n) * 1e8) / 1e8).toString();
  const required = fmt(parseFloat(r.amount || 0) * 0.10);

  res.send(`<!doctype html>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pending Withdrawal Receipt</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@3.4.7/dist/tailwind.min.css">
  <body class="bg-[#0f1320] text-gray-100">
    <main class="max-w-2xl mx-auto p-6">
      <div class="rounded-xl overflow-hidden border border-white/10 mb-6">
        <img src="/banner.jpg" alt="Header" class="w-full h-40 object-cover">
      </div>

      <div class="bg-[#141a2e] border border-white/10 rounded-xl p-6 shadow-2xl space-y-4">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-semibold">Withdrawal Receipt</h1>
          <span class="px-3 py-1 rounded-full text-sm ${r.status === 'Pending' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}">${r.status}</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div><div class="text-gray-400">Receipt ID</div><div class="break-all">${r.receiptId}</div></div>
          <div><div class="text-gray-400">Created</div><div>${new Date(r.ts).toLocaleString()}</div></div>
          <div><div class="text-gray-400">Network</div><div>${r.chain}</div></div>
          <div><div class="text-gray-400">Amount</div><div>${fmt(r.amount)}</div></div>
          <div class="sm:col-span-2"><div class="text-gray-400">Withdrawal Address</div><div class="break-all">${r.address}</div></div>
          <div class="sm:col-span-2"><div class="text-gray-400">Public Code</div><div class="break-all">${r.publicCode}</div></div>
          <div><div class="text-gray-400">Required Existing Balance (10%)</div><div>${required}</div></div>
          <div><div class="text-gray-400">Requirement Confirmed</div><div>${r.requirementConfirmed ? "Yes" : "No"}</div></div>
        </div>

        <p class="text-xs text-gray-400 pt-2">
          This receipt confirms your request is pending manual review and payout. Do not share private keys or seed phrases.
        </p>

        <div class="flex gap-3 pt-2">
          <button onclick="window.print()" class="bg-sky-600 hover:bg-sky-500 px-4 py-2 rounded">Print / Save PDF</button>
          <a href="/" class="bg-white/10 hover:bg-white/20 px-4 py-2 rounded">Back</a>
        </div>
      </div>
    </main>
  </body>`);
});

// Admin view
app.get("/admin", (req, res) => {
  if ((req.query.key || "") !== ADMIN_KEY) return res.status(401).send("Unauthorized");
  const row = (cols) => `<tr>${cols.map(c => `<td class="p-2 align-top break-all">${c ?? ""}</td>`).join("")}</tr>`;
  res.send(`<!doctype html>
  <meta charset="utf-8">
  <title>Admin — Withdrawal Requests</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@3.4.7/dist/tailwind.min.css">
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-semibold mb-6">Withdrawal Requests</h1>
    <table class="w-full text-sm border">
      <thead>
        <tr class="bg-gray-100">
          <th class="p-2">Time</th>
          <th>Chain</th>
          <th>Address</th>
          <th>Amount</th>
          <th>Public Code</th>
          <th>Requirement</th>
          <th>Receipt</th>
          <th>Status</th>
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
                    w.requirementConfirmed ? "Confirmed" : "—",
                    `<a class="text-sky-600 underline" href="/receipt/${w.receiptId}" target="_blank">${w.receiptId.slice(0,8)}...</a>`,
                    w.status,
                    w.ip
                  ])
                )
                .join("")
            : row(["None yet", "", "", "", "", "", "", "", ""])
        }
      </tbody>
    </table>
  </div>`);
});

// Default route
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "withdraw.html"));
});

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
