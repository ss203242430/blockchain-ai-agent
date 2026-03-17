# Blockchain AI Agent — Spec viewer

The spec entry and Markdown sources live under **`docs/`**; the .md files are in **`docs/spec/`**.

---

## Files

| File | Description |
|------|-------------|
| `docs/index.html` | **Single entry**: view the spec in a browser; switch between English (default) and 中文 |
| `docs/spec/blockchain-ai-agent-product-spec.md` | Product spec in **English** (default) |
| `docs/spec/blockchain-ai-agent-product-spec.zh.md` | Product spec in **Chinese** (中文) |

The spec is the only part of the project with two language versions; default is English.

---

## How to run / view the spec

### Option 1: View in a browser (recommended)

1. Go to the **`docs/`** directory.
2. Start a server:
   ```bash
   cd docs
   npx serve .
   ```
   Or: `python3 -m http.server 8000`
3. Open in your browser: `http://localhost:3000/` (or `:8000` for Python).
4. Use the **English** or **中文** link at the top to switch language (default is English).

### Option 2: Edit / preview Markdown directly

- Open `docs/spec/blockchain-ai-agent-product-spec.md` (English) or `docs/spec/blockchain-ai-agent-product-spec.zh.md` (Chinese) in your editor and use Markdown preview (with Mermaid for diagrams).

---

## Quick command (run from repo root)

```bash
cd docs
npx serve .

# Then open http://localhost:3000/
```
