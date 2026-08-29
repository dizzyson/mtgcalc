# Mortgage Suite — GitHub Pages site

A free, static web suite of four mortgage tools:

| Page | Tool |
|---|---|
| `index.html` | Landing page — guides a borrower through all 4 tools |
| `quick-income.html` | Quick Income Calculator (minimal, PDF + JPEG export) |
| `income-calculator.html` | Full Income Calculator & Guideline Engine |
| `renovation-suite.html` | Mortgage Renovation Suite (FHA 203(k) / HomeStyle) |
| `all-in-one.html` | All-in-One Income + Renovation Workbench |

Every page is self-contained — no build step, no server code. A small floating
navigation pill on each tool lets a borrower move between all four and home.

## Publish on GitHub Pages (free)

**Option A — your main site at `https://YOURNAME.github.io`**

1. Sign in at github.com (create a free account if needed).
2. Click **+ → New repository** and name it exactly `YOURNAME.github.io`
   (replace YOURNAME with your GitHub username). Keep it **Public**. Create it.
3. On the new repo page, click **uploading an existing file**, drag in all the
   files from this folder, and click **Commit changes**.
4. Wait 1–2 minutes, then open `https://YOURNAME.github.io` — done.

**Option B — as a project site (keeps your main github.io free)**

1. Create a repository named e.g. `mortgage-suite` (Public).
2. Upload the files the same way and commit.
3. Go to **Settings → Pages**, under *Build and deployment* choose
   **Deploy from a branch**, branch `main`, folder `/ (root)`, and Save.
4. The site appears at `https://YOURNAME.github.io/mortgage-suite/`.

To update any tool later, open the file in the repo, click the pencil icon (or
re-upload the file), and commit — the site refreshes automatically.
