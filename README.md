# Blockchain AI Agent

Blockchain AI Agent supports **reading NFT metadata** and **querying on-chain transactions**: query `tokenURI`, fetch and parse metadata (name, description, image, attributes), and look up transactions and receipts by tx hash (Ethereum, Arbitrum One, Arbitrum Nova). No mint, no transfers; permissions are locked by the **nxtlinq-attest** plugin to the declared tool scope.

## Specification

- **Product spec**: See [docs/spec/](docs/spec/), or run `cd docs && npx serve .` and open [http://localhost:3000/](http://localhost:3000/) in your browser.
- See [README-SPEC.md](README-SPEC.md) for details.

## Requirements

- Node.js 22+
- [nxtlinq-attest](https://github.com/nxtlinqit/nxtlinq-attest) for local signing/verification
- **Chat mode**: Set the `OPENAI_API_KEY` environment variable (OpenAI API is used so the AI can call tools from natural language)

## Quick start

```bash
npm install

# Initial setup (before first build)
nxtlinq-attest init
# Edit nxtlinq/agent.manifest.json: name = "blockchain-ai-agent", scope = tools to use, e.g. ["tool:GetTokenURI", "tool:ReadNFTMetadata", "tool:GetTransaction", "tool:FormatAsCSV"]
nxtlinq-attest sign

# Build (TypeScript → dist/)
npm run build
```

Do not commit `nxtlinq/private.key`; only commit manifest, sig, and public.key. **`npm run build`** only runs `tsc` (no attest in the build script). During development you often have no `dist/` or only run build without re-signing; **nxtlinq-attest verify** uses `dist/` and the repo to check manifest and artifact hashes, and runs in **CI** so that only verified code can pass before merge or deploy.

## Usage

```bash
# Print current attested scope
npm run agent -- scope

# Query tokenURI (contract + tokenId)
npm run agent -- run GetTokenURI contract=0xabc... tokenId=1

# Read NFT metadata (from URI, e.g. IPFS/HTTP)
npm run agent -- run ReadNFTMetadata uri=ipfs://Qm...

# Query transaction (txHash required; chainId optional, default 42170 = Arbitrum Nova)
npm run agent -- run GetTransaction txHash=0x2d56678e0c1f4a58ca7203b4c3cc6d9e46f64cb435d188cdbf152d3c0a28fce8 chainId=42170

# Convert JSON to CSV (output=filename writes under output/; folder is created if missing)
npm run agent -- run FormatAsCSV data='[{"from":"0xa","to":"0xb","value":"1"}]' output=result.csv

# Natural language (AI will call tools as needed; can ask to export data as CSV)
export OPENAI_API_KEY=sk-...
npm run agent -- chat "What is the metadata for contract 0xabc token 1?"
npm run agent -- chat "Query this Arbitrum Nova tx 0x2d56... and export to CSV file tx.csv"
```

- **run**: Run a specific tool with arguments; only tools in manifest scope are allowed.
- **chat**: OpenAI interprets the question and decides which tools to call; execution is still gated by attest scope (only declared tools can run).

## CI (GitHub Actions)

The repo includes a workflow that runs on every **push** and **pull request** to `main` or `master`.

### What it does

1. **Checkout** — Check out the repo.
2. **Setup Node.js** — Node 22 with npm cache.
3. **Install dependencies** — `npm ci` (uses `package-lock.json`).
4. **Build** — `npm run build` (TypeScript → `dist/`).
5. **Verify attestation** — `npx nxtlinq-attest verify` (checks manifest signature and **artifact hashes of `dist/`**). If this fails, CI fails.

If any step fails, the workflow fails. Passing CI means the committed code and `nxtlinq/` manifest/signature are consistent and unchanged.

### How to use it

1. **Push the workflow file** — Ensure [`.github/workflows/attest.yml`](.github/workflows/attest.yml) is in your repo (it is in this template).
2. **Use GitHub** — Push to a GitHub repo; Actions run automatically. No secrets needed for this workflow.
3. **After code or manifest changes** — Run `nxtlinq-attest sign` locally and commit the updated `nxtlinq/agent.manifest.json` and `nxtlinq/agent.manifest.sig`. Otherwise the verify step will fail (hash mismatch).

### If verify fails (e.g. in CI)

- **Hash mismatch** — You changed source files or the manifest without re-signing. Run `nxtlinq-attest sign` and commit the new manifest and sig.
- **Missing nxtlinq/** — Commit the `nxtlinq/` folder (manifest, sig, public.key). Do **not** commit `nxtlinq/private.key`.
- **What verify uses** — It hashes the repo artifacts (including **`dist/`**) and compares with the signed manifest; that’s why a successful verify means “this `dist/` matches what was attested.”

## Project structure

```
blockchain-ai-agent/
├── src/
│   ├── agent.ts   # runTool, scope checks
│   ├── ai.ts      # OpenAI integration, chat mode (tool use)
│   ├── tools.ts   # GetTokenURI, ReadNFTMetadata, GetTransaction, FormatAsCSV
│   └── cli.ts     # CLI (scope / run / chat)
├── nxtlinq/       # attest plugin
├── docs/          # product spec
└── .github/workflows/attest.yml
```

## Links

- [nxtlinq-attest](https://github.com/nxtlinqit/nxtlinq-attest) — Signing and verification (plugin)
- [nxtlinq attest product spec](https://attest.nxtlinq.ai/)
