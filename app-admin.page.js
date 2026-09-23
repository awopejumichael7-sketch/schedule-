import { el, clear } from "./app-dom.utils.js";
import { db } from "./app-firebase-init.js";
import { collection, getDocs, doc, updateDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Admin dashboard (§31). Deliberately reads ONLY the top-level users/{uid}
// profile documents — never a user's schedules/completionRecords/etc.
// subcollections, which security rules forbid the admin role from
// accessing anyway (see firestore.rules and SECURITY.md).
export async function renderAdmin(root, adminUser) {
  clear(root);
  const page = el("div", { class: "page admin-page" });
  page.appendChild(el("h1", { text: "Admin dashboard" }));

  const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
  const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const activeCount = users.filter((u) => !u.disabled).length;
  page.appendChild(el("div", { class: "stat-grid" }, [
    statCard("Total users", users.length),
    statCard("Active", activeCount),
    statCard("Disabled", users.length - activeCount),
    statCard("Admins", users.filter((u) => u.role === "ADMIN").length),
  ]));

  page.appendChild(el("p", { class: "privacy-note", text: "Privacy note: this dashboard shows account status only — never any user's private schedules, notes, or completion history." }));

  const table = el("div", { class: "admin-table" });
  for (const u of users) {
    table.appendChild(el("div", { class: "admin-row" }, [
      el("div", {}, [
        el("div", { text: u.name || "(no name)" }),
        el("div", { class: "muted small", text: u.email }),
      ]),
      el("div", { class: `badge ${u.role === "ADMIN" ? "badge-high" : "badge-scheduled"}`, text: u.role }),
      el("div", { class: `badge ${u.disabled ? "badge-missed" : "badge-completed"}`, text: u.disabled ? "Disabled" : "Active" }),
      el("button", { class: "btn btn-secondary", onClick: async () => {
        await updateDoc(doc(db, "users", u.id), { disabled: !u.disabled, updatedAt: serverTimestamp() });
        renderAdmin(root, adminUser);
      }}, [u.disabled ? "Enable" : "Disable"]),
    ]));
  }
  page.appendChild(table);
  root.appendChild(page);
}

function statCard(label, value) {
  return el("div", { class: "stat-card stat-neutral" }, [
    el("div", { class: "stat-value", text: String(value) }),
    el("div", { class: "stat-label", text: label }),
  ]);
}
