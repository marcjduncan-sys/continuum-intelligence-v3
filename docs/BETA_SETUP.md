# Beta Version Setup Guide

This guide helps you create a test version of Continuum with the new event-reactive system.

## Why Create a Beta Version?

- ✅ Keep your current website working
- ✅ Test the new system safely
- ✅ Compare old vs new side-by-side
- ✅ Switch only when you're happy

---

## Method 1: New Repository (Recommended)

### Step 1: Create New Repo

1. Go to https://github.com/new
2. Repository name: `continuum-intelligence-beta`
3. Select: **Public**
4. Check: ✅ Add a README file
5. Click **Create repository**

### Step 2: Enable GitHub Pages

1. In your new repo, click **Settings** tab
2. Click **Pages** on the left menu
3. Under "Source", select: **Deploy from a branch**
4. Branch: **main** / **/(root)**
5. Click **Save**
6. Wait 2-3 minutes

Your beta site will be at:
```
https://marcjduncan-sys.github.io/continuum-intelligence-beta/
```

### Step 3: Upload Files

1. In your new repo, click **"<> Code"** tab
2. Click **"Add file"** → **"Upload files"**
3. Upload these files from your computer:
   - `index.html` (your current website)
   - Create folder `.github/workflows/` and upload `event-monitor.yml`
   - Create folder `scripts/` and upload the 3 script files
   - Create folder `data/` and upload the EVENT_SYSTEM.md

Or use this drag-and-drop batch:

```
📁 continuum-intelligence-beta/
├── 📄 index.html
├── 📁 .github/
│   └── 📁 workflows/
│       └── 📄 event-monitor.yml
├── 📁 scripts/
│   ├── 📄 event-scraper.js
│   ├── 📄 narrative-generator.js
│   └── 📄 update-html.js
├── 📁 data/
│   └── 📄 (empty folder for now)
└── 📄 README.md
```

### Step 4: Test It

1. Go to your beta URL (from Step 2)
2. Check it looks the same as your main site
3. Wait for first automation run (or trigger manually)

---

## Method 2: Branch (More Advanced)

If you're comfortable with branches:

```bash
# Create a new branch called "v2"
git checkout -b v2

# Add the new files
git add scripts/ .github/workflows/ data/ EVENT_SYSTEM.md
git commit -m "Add event-reactive system"
git push origin v2
```

Then enable Pages for the `v2` branch in Settings.

---

## Comparing Versions

Once both are running:

| Feature | Current Site | Beta Site |
|---------|-------------|-----------|
| URL | `...continuum-intelligence/` | `...continuum-intelligence-beta/` |
| Prices | Static | Updates automatically |
| Events | Manual | Auto-detected |
| Freshness | Manual | Auto-calculated |

---

## Switching to the New System

When you're happy with the beta:

### Option A: Replace Main Site (Simple)

1. Download all files from beta repo
2. Upload them to your main repo
3. Done!

### Option B: Merge Changes (Better)

1. In beta repo, click **"Compare & pull request"**
2. Set: base = `main`, compare = `v2` (or your beta branch)
3. Click **"Create pull request"**
4. Review changes
5. Click **"Merge"**

---

## Troubleshooting

### Beta site shows 404
- Wait 5 minutes after enabling Pages
- Check Settings → Pages shows green checkmark
- Ensure index.html is at root level

### Automation not running
- Check Actions tab in beta repo
- Click "Enable workflows" if prompted
- Trigger manually first time

### Files not uploading
- GitHub has 100MB limit per file
- Your index.html is fine (~700KB)
- Use GitHub Desktop if browser upload fails

---

## Need Help?

If stuck at any step, tell me which step number and I'll help!
