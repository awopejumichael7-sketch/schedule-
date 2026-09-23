// dom.js — small DOM helpers. IMPORTANT: never use innerHTML with
// user-generated content (SECURITY.md — XSS prevention). Use textContent.
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v; // safe — never innerHTML
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function qs(sel, root = document) { return root.querySelector(sel); }
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
