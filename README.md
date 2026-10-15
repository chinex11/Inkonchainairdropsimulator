# Ink Airdrop Checker (unofficial)

Paste a wallet address, optionally a GitHub and X username, and the server scores it with an
Arbitrum-style points model and estimates a token amount from a 1,000,000,000 supply.
No wallet connection and no signing.

## Run

    node server.js            # Node 18+, no npm install needed
    # open http://localhost:3000

## Environment variables (all optional)

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Server port | `3000` |
| `GITHUB_TOKEN` | Raises GitHub rate limit (search is 10 requests/min without it) | none |
| `X_BEARER_TOKEN` | Enables automatic X follower and account-age lookup (X API v2, paid tiers) | none, users type their numbers |
| `INK_GITHUB_ORGS` | Comma-separated GitHub orgs that count as "Ink repos" | `inkonchain` |
| `INK_EXPLORER` | Blockscout base URL | `https://explorer.inkonchain.com` |
| `INK_RPC` | JSON-RPC endpoint | `https://rpc-gel.inkonchain.com` |
| `INK_MAINNET_LAUNCH` | Date used for the early-adopter tiers | `2024-12-09T00:00:00Z` |
| `MAX_TX_PAGES` | Explorer pages read per wallet (50 txs each) | `20` |

## What is fetched

- **Ink RPC**: transaction count (account nonce).
- **Ink explorer (Blockscout API v2)**: transaction history for months active, unique apps, contract deployments and first transaction date; ETH and ERC-20 balances priced by the explorer.
- **GitHub REST**: commit and merged-PR counts per org via the search API.
- **X API v2**: followers and account created date, only if `X_BEARER_TOKEN` is set.

## Scoring (max 75)

Edit the `TIERS_*` tables at the top of `server.js`.

- Wallet activity 44: transactions 14, active months 10, apps used 8, value held 8, early adopter 4
- GitHub 20: commits 11, merged PRs 6, contracts deployed 3
- X reach 11: followers 9, account age 2

Two farming heuristics halve the score each: 200+ transactions to 2 or fewer apps, and 100+ transactions in the wallet's first week.

## Limits worth knowing

- Value held on Ink is a stand-in for bridged volume. Bridge deposits are not read.
- The explorer and RPC could not be reached from the build sandbox, so the on-chain calls follow the documented Blockscout v2 shapes and are untested live. If a field differs, the server degrades: that item shows "unavailable" and a note appears. Check with a real address first.
- GitHub and X usernames are self-declared and not verified. Real verification needs OAuth sign-in.
- Discord, governance votes and NFTs from the earlier simulator are dropped because they cannot be read without a login or a known contract list.
- Ink has published no airdrop. Every weight and pool number is an assumption.
