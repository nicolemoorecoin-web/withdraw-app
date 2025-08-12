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
// HTML receipt page (PRO look)
app.get("/receipt/:id", (req, res) => {
  const r = receipts.get(req.params.id);
  if (!r) return res.status(404).send("Receipt not found");

  const fmt = (n) => (Math.round(parseFloat(n || 0) * 1e8) / 1e8).toString();
  const unitByChain = { bitcoin: "BTC", ethereum: "ETH", dogecoin: "DOGE" };
  const unit = unitByChain[r.chain] || r.chain.toUpperCase();
  const required = fmt(parseFloat(r.amount || 0) * 0.10);
  const amountStr = `${fmt(r.amount)} ${unit}`;
  const requiredStr = `${required} ${unit}`;
  const createdAt = new Date(r.ts).toLocaleString();

  // Optional branding from env (set in Render → Environment)
  const BRAND = process.env.BUSINESS_NAME || "Your Company";
  const SUPPORT = process.env.SUPPORT_EMAIL || "support@example.com";

  res.send(`<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Withdrawal Receipt – ${r.receiptId}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @media print {
        .no-print { display: none !important; }
        body { background: #fff !important; }
        .sheet { box-shadow: none !important; border: 1px solid #eee; }
      }
    </style>
  </head>
  <body class="bg-[#0f1320] text-gray-100">
    <main class="max-w-3xl mx-auto p-6">
      <!-- Paper sheet -->
      <div class="sheet bg-[#0b1020] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
        <!-- Header / Brand bar -->
        <div class="flex items-center justify-between p-5 bg-[#10162a] border-b border-white/10">
          <div class="flex items-center gap-3">
            <img src="/banner.jpg" alt="" class="w-14 h-14 object-cover rounded-md border border-white/10">
            <div>
              <div class="text-lg font-semibold">${BRAND}</div>
              <div class="text-xs text-gray-400">${SUPPORT}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-xs text-gray-400">Receipt ID</div>
            <div class="font-mono text-sm">${r.receiptId}</div>
            <span class="inline-block mt-2 px-2 py-1 rounded-full text-xs
              ${r.status === 'Pending' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}">
              ${r.status}
            </span>
          </div>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-6">
          <!-- Meta row -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div class="text-gray-400">Created</div>
              <div>${createdAt}</div>
            </div>
            <div>
              <div class="text-gray-400">Network</div>
              <div class="uppercase">${r.chain}</div>
            </div>
            <div>
              <div class="text-gray-400">Requester IP</div>
              <div class="font-mono">${r.ip || "-"}</div>
            </div>
          </div>

          <!-- Summary table -->
          <div>
            <div class="text-sm text-gray-300 mb-2">Withdrawal Summary</div>
            <table class="w-full text-sm border border-white/10 rounded-lg overflow-hidden">
              <thead class="bg-[#0f162d]">
                <tr>
                  <th class="text-left px-3 py-2">Field</th>
                  <th class="text-left px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-t border-white/10">
                  <td class="px-3 py-2 text-gray-400">Amount</td>
                  <td class="px-3 py-2">${amountStr}</td>
                </tr>
                <tr class="border-t border-white/10">
                  <td class="px-3 py-2 text-gray-400">Required Existing Balance (10%)</td>
                  <td class="px-3 py-2">${requiredStr}</td>
                </tr>
                <tr class="border-t border-white/10">
                  <td class="px-3 py-2 text-gray-400">Withdrawal Address</td>
                  <td class="px-3 py-2 break-all font-mono">${r.address}</td>
                </tr>
                <tr class="border-t border-white/10">
                  <td class="px-3 py-2 text-gray-400">Public Code</td>
                  <td class="px-3 py-2 break-all font-mono">${r.publicCode}</td>
                </tr>
                <tr class="border-t border-white/10">
                  <td class="px-3 py-2 text-gray-400">Requirement Confirmed</td>
                  <td class="px-3 py-2">${r.requirementConfirmed ? "Yes" : "No"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- QR + link -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            <div>
              <div id="qr" class="w-40 h-40 bg-[#0b0f1c] border border-white/10 rounded-lg flex items-center justify-center"></div>
              <div class="text-xs text-gray-400 mt-2">Scan to view this receipt online</div>
            </div>
            <div class="text-sm">
              <div class="text-gray-400 mb-1">Receipt Link</div>
              <div class="flex items-center gap-2">
                <input id="link" class="flex-1 bg-[#0f1320] border border-white/10 rounded px-3 py-2 font-mono text-xs" readonly>
                <button class="no-print bg-sky-600 hover:bg-sky-500 px-3 py-2 rounded text-xs" onclick="
                  navigator.clipboard.writeText(document.getElementById('link').value).then(()=>alert('Link copied'));
                ">Copy</button>
              </div>
              <div class="mt-4 flex gap-2">
                <button onclick="window.print()" class="no-print bg-white/10 hover:bg-white/20 px-4 py-2 rounded">Print / Save PDF</button>
                <a href="/" class="no-print bg-sky-600 hover:bg-sky-500 px-4 py-2 rounded">Back</a>
              </div>
            </div>
          </div>

          <!-- Terms -->
          <div class="text-[11px] text-gray-400 border-t border-white/10 pt-4">
            This document acknowledges your withdrawal request. Processing typically takes 20–30 minutes during business hours.
            Never share your private keys or seed phrase. All transfers are final upon network confirmation.
          </div>
        </div>
      </div>
    </main>

    <!-- QR generator -->
    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
    <script>
      const url = window.location.origin + window.location.pathname;
      document.getElementById('link').value = url;
      QRCode.toCanvas(document.createElement('canvas'), url, { margin: 1 }, (err, canvas) => {
        if (!err) document.getElementById('qr').appendChild(canvas);
      });
    </script>
  </body>
  </html>`);
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

