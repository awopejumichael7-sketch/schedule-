import { el, clear } from "./app-dom.utils.js";
import { registerWithEmail, loginWithEmail, loginWithGoogle } from "./app-auth.service.js";

export function renderLogin(root) {
  clear(root);
  let mode = "login";

  const errorBox = el("p", { class: "form-error", role: "alert" });
  const nameInput = el("input", { type: "text", placeholder: "Full name", class: "input", autocomplete: "name" });
  const emailInput = el("input", { type: "email", placeholder: "Email", class: "input", autocomplete: "email" });
  const passInput = el("input", { type: "password", placeholder: "Password", class: "input", autocomplete: "current-password" });

  const nameField = el("div", { class: "field hidden" }, [nameInput]);

  const submitBtn = el("button", { class: "btn btn-primary", type: "submit", text: "Sign in" });
  const toggleLink = el("a", { href: "#", class: "link", text: "New here? Create an account" });

  toggleLink.addEventListener("click", (e) => {
    e.preventDefault();
    mode = mode === "login" ? "register" : "login";
    nameField.classList.toggle("hidden", mode === "login");
    submitBtn.textContent = mode === "login" ? "Sign in" : "Create account";
    toggleLink.textContent = mode === "login" ? "New here? Create an account" : "Already have an account? Sign in";
    errorBox.textContent = "";
  });

  const form = el("form", { class: "auth-form", onSubmit: async (e) => {
    e.preventDefault();
    errorBox.textContent = "";
    try {
      if (mode === "login") {
        await loginWithEmail(emailInput.value.trim(), passInput.value);
      } else {
        if (!nameInput.value.trim()) throw new Error("Please enter your name.");
        await registerWithEmail(nameInput.value.trim(), emailInput.value.trim(), passInput.value);
      }
    } catch (err) {
      errorBox.textContent = friendlyAuthError(err);
    }
  }}, [
    nameField,
    el("div", { class: "field" }, [emailInput]),
    el("div", { class: "field" }, [passInput]),
    errorBox,
    submitBtn,
    el("div", { class: "divider", text: "or" }),
    el("button", { class: "btn btn-google", type: "button", onClick: async () => {
      try { await loginWithGoogle(); } catch (err) { errorBox.textContent = friendlyAuthError(err); }
    }}, ["Continue with Google"]),
    toggleLink,
  ]);

  root.appendChild(el("div", { class: "auth-shell" }, [
    el("div", { class: "auth-card" }, [
      el("h1", { class: "auth-title", text: "SSAS" }),
      el("p", { class: "auth-subtitle", text: "Plan your day. Remember what matters. Finish what you start." }),
      form,
    ]),
  ]));
}

function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Incorrect email or password.";
  if (code.includes("email-already-in-use")) return "That email is already registered — try signing in instead.";
  if (code.includes("weak-password")) return "Please choose a password with at least 6 characters.";
  if (code.includes("user-not-found")) return "No account found with that email.";
  return err.message || "Something went wrong. Please try again.";
}
