# Iran Transition Monitoring Framework (TMF)

A real-time probabilistic dashboard for tracking political, military, and economic signals during the 2026 Iran transition crisis.

## Features

- **Scenario Probability Matrix** — Live weighted scoring across 4 transition scenarios
- **33 High-Frequency Indicators** — Security, institutional, external, and economic signal tracking
- **Leader Profiles** — Khamenei / Pahlavi / Larijani with confirmation signals
- **Military Unit Tracker** — Artesh vs IRGC defection monitoring
- **Economic Kill-Switch Panel** — Oil sector, Rial, and bazaar triggers
- **Analyst Notes** — Persistent scratchpad with assessment summary
- All state persists locally per analyst via localStorage

---

## Deploy in 5 minutes (Vercel — recommended)

### Step 1 — Push to GitHub

```bash
cd iran-tmf
git init
git add .
git commit -m "Initial commit — Iran TMF dashboard"
```

Create a new repo at https://github.com/new (name it `iran-tmf`), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/iran-tmf.git
git branch -M main
git push -u origin main
```

### Step 2 — Deploy on Vercel

1. Go to https://vercel.com and sign in with GitHub
2. Click **"Add New Project"**
3. Import your `iran-tmf` repository
4. Leave all settings as default (Vercel auto-detects Create React App)
5. Click **Deploy**

Your dashboard will be live at `https://iran-tmf.vercel.app` (or similar) within ~60 seconds.

---

## Deploy on Netlify (alternative)

1. Go to https://netlify.com and sign in with GitHub
2. Click **"Add new site" → "Import an existing project"**
3. Connect your GitHub repo
4. Set build command: `npm run build`
5. Set publish directory: `build`
6. Click **Deploy site**

---

## Run locally

```bash
npm install
npm start
```

Opens at http://localhost:3000

---

## Custom domain (optional)

After deploying on Vercel or Netlify, go to your project settings → Domains → Add custom domain. Register a domain (~$10/yr) at Namecheap or Cloudflare Domains and point it at your deployment.

---

## Data & disclaimer

This dashboard is an **open-source intelligence simulation tool** for analytical purposes. All indicator weights and scenario probabilities are user-driven — the framework provides structure for organising publicly available information, not classified intelligence. Users are responsible for sourcing their own real-time data from recommended feeds (ISW, ACLED, NetBlocks, Kpler, Bonbast).
