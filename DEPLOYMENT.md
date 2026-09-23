# DEPLOYMENT.md — Full free deployment walkthrough

Every step below is free and requires no billing account unless
explicitly flagged. Follow in order.

## 1. Create the Firebase project

1. https://console.firebase.google.com → **Add project** → name it (e.g.
   `ssas-yourname`) → you can decline Google Analytics (optional, not
   needed) → **Create project**. No card required — this is the Spark
   (free) plan by default.

## 2. Enable Authentication

1. Firebase Console → **Build → Authentication → Get started**.
2. Enable **Email/Password**.
3. Enable **Google** sign-in (needed for both app login *and* is separate
   from the Google *Calendar* OAuth client you'll create in step 5 — this
   one is just for signing into SSAS itself, also free).

## 3. Create the Firestore database

1. **Build → Firestore Database → Create database**.
2. Choose **Production mode** (we ship our own rules — see step 4).
3. Pick a region close to your users.

## 4. Deploy security rules and indexes

```bash
npm install -g firebase-tools    # free CLI
firebase login
cd firebase
firebase use --add               # select your project, give it an alias e.g. "default"
firebase deploy --only firestore:rules,firestore:indexes
```

## 5. Register the Web app and fill in config

1. Firebase Console → Project Settings → **Your apps → Add app → Web**.
2. Copy the config object into
   `app-firebase-config.js` (replacing every
   `REPLACE_WITH_...` placeholder). These values are not secret — see the
   comment at the top of that file.

## 6. Generate the Admin SDK service account (for the automation scripts)

1. Project Settings → **Service accounts → Generate new private key**.
   Downloads a JSON file — **never commit this file** (already covered by
   `.gitignore`).
2. Minify it to one line (so it fits a GitHub secret cleanly):
   ```bash
   node -e "console.log(JSON.stringify(require('./path/to/downloaded-key.json')))"
   ```
3. In your GitHub repo: **Settings → Secrets and variables → Actions →
   New repository secret** → name `FIREBASE_SERVICE_ACCOUNT_JSON`, paste
   the one-line JSON.

## 7. Set up Google Calendar OAuth

Follow `GOOGLE-CALENDAR.md` in full. At the end you'll have:
- `GOOGLE_OAUTH_CLIENT_ID` → paste into `firebase-config.js` (public)
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` → add as GitHub Actions
  secrets (same Settings page as step 6).

## 8. Set up the Telegram bot

Follow `TELEGRAM.md`. Add `TELEGRAM_BOT_TOKEN` as a GitHub Actions
secret.

## 9. Set up email

Follow `EMAIL.md`. Add `GMAIL_USER` and `GMAIL_APP_PASSWORD` as
GitHub Actions secrets.

## 10. Generate a Web Push VAPID key (for push notifications)

1. Firebase Console → Project Settings → **Cloud Messaging → Web
   configuration → Generate key pair**.
2. Copy the key into `FCM_VAPID_KEY` in `firebase-config.js` (public key
   — safe to ship).

## 11. Deploy the frontend (Firebase Hosting — free)

```bash
cd firebase
firebase deploy --only hosting
```

Your app is now live at `https://your-project.web.app`, with free HTTPS.

Alternative free host: GitHub Pages, if you'd rather not use Firebase
Hosting — just point it at the `public/` folder; nothing in the frontend
is Firebase-Hosting-specific.

## 12. Turn on the scheduled engines

The two workflows in `.github/workflows/` activate automatically once
this repo is pushed to GitHub **and** the secrets from steps 6–9 are set
— no extra step needed. Verify:

1. Push this repo to a GitHub repository.
2. **Actions tab** → you should see "SSAS Reminder Engine" and "SSAS
   Accountability Engine" listed.
3. Click into either → **Run workflow** (manual trigger) to test
   immediately rather than waiting for the next 5-minute tick.
4. Check the run's logs for `[reminder-engine] run complete...` or
   `[accountability-engine] run complete...`.

## 13. Add your first admin user

New accounts default to `role: "USER"`. To make yourself an admin, run
this once via the Firebase Console → Firestore → find your `users/{uid}`
document → manually set `role` to `"ADMIN"` (admins cannot self-promote
through the app, by design — see SECURITY.md).

## 14. Install as a PWA

Visit your deployed URL on a phone or desktop Chrome/Edge — you'll see an
"Install" prompt (or use the browser's "Add to Home Screen" / "Install
app" menu item). See `ICONS-README.md` — add real icon files first
for a polished install experience.

## If any step above wants a credit card

None of steps 1–14 require one on the described free tiers, as of this
writing. If Google, GitHub, or Telegram change their free-tier terms
after this was written, **stop and re-verify** against
`FREE-TIER-LIMITS.md`'s sources before proceeding — don't assume the
old terms still hold.
