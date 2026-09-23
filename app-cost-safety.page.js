import { el, clear } from "./app-dom.utils.js";

// Cost Safety Dashboard (§3, §52). Shows documented free-tier ceilings and
// links to the authoritative docs — it does not (and cannot, from the
// client alone) meter real-time Firebase project usage, since that data
// lives in the Firebase/Google Cloud console, not Firestore itself. What
// it CAN do reliably: show the user their own notification volume this
// month (their own data, owner-readable) against the documented Gmail
// send limit, which is the most likely thing an individual user could
// personally approach.
export async function renderCostSafety(root) {
  clear(root);
  const page = el("div", { class: "page cost-safety-page" });
  page.appendChild(el("h1", { text: "Cost safety" }));
  page.appendChild(el("p", { class: "muted", text: "SSAS is built to run entirely on free tiers. Nothing here ever triggers a paid upgrade automatically." }));

  const rows = [
    ["Firestore reads/writes/deletes", "50,000 / 20,000 / 20,000 per day", "Firebase Spark plan (verified in FREE-TIER-LIMITS.md)"],
    ["Firestore storage", "1 GiB total", "Firebase Spark plan"],
    ["Firebase Hosting", "10 GB storage, 360 MB/day transfer", "Firebase Spark plan"],
    ["GitHub Actions minutes", "2,000 minutes/month", "GitHub Free plan"],
    ["Gmail SMTP sending", "~500 messages/day", "Google consumer Gmail account limit"],
    ["Telegram Bot API", "No hard billing limit", "Telegram Bot API terms"],
    ["Google Calendar API", "1,000,000 requests/day per project", "Google Cloud default quota"],
  ];

  const table = el("div", { class: "cost-table" });
  for (const [service, limit, source] of rows) {
    table.appendChild(el("div", { class: "cost-row" }, [
      el("div", { text: service }),
      el("div", { class: "muted", text: limit }),
      el("div", { class: "muted small", text: source }),
    ]));
  }
  page.appendChild(table);
  page.appendChild(el("p", { class: "muted small", text: "See FREE-TIER-LIMITS.md for full detail, including what happens (a warning banner, never a silent charge) if any of these are approached." }));
  root.appendChild(page);
}
