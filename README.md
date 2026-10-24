# Ink Airdrop Checker (unofficial)

Paste a wallet address (and ). The page reads the
wallet's public activity and gives an estimated score, tier and token amount on a 1,000,000,000 supply.
No wallet connection and no signing.

## Host on Vercel (no build step)

Import the repo at vercel.com. `vercel.json` serves `docs/` as the site and Vercel runs `api/gm.js` as a
function (gm.ink sends no CORS headers, so the page reads the GM leaderboard through this function).

## Run locally

    node tools/local-server.js     # Node 18+, no install, http://localhost:3000

## What is read

- **Ink RPC and explorer (Blockscout)**: transactions, active months, apps used, holdings, contracts deployed, first transaction date.
- **gm.ink leaderboard** (`/api/user-leaderboard`): rank, streak, GMs sent and received, people greeted.

## Scoring (max 78, edit the tier tables at the top of `docs/checker.js`)

- Wallet activity 44: transactions 14, active months 10, apps 8, value held 8, early adopter 4
- Ink identity 10: .ink domain owned (ZNS Connect) up to 4, NFT collections held up to 3, Kraken verified wallet 3 (read from the onchain EAS verification record on Ink, via ink.easscan.org)
- Ink usage 9: token transfers 3, gas used 3, contracts deployed 3
- Ink GM 15: leaderboard rank by percentile 10 (top 1% = 10, 5% = 8, 10% = 6, 25% = 4, 50% = 2, any rank = 1), streak 3, people greeted 2

Two farming rules halve the score each: 200+ transactions to 2 or fewer apps, and 100+ transactions in the wallet's first week.

## Rankings

- **GM rank**: exact, from the gm.ink leaderboard.
- **Transactions among Kraken-verified wallets**: exact. `tools/build-verified-snapshot.js` reads every wallet with an active Kraken Verify attestation and its transaction count, and writes `docs/verified-snapshot.json`. A GitHub Action refreshes it daily. A wallet that is not verified sees where it would rank.
- **Transactions and score among all Ink wallets**: estimates. The explorer cannot list wallets by activity, so these use the chain's total wallet and transaction counts and an assumed spread.

## Limits

- The Ink Foundation has confirmed an INK token (1B cap) and an airdrop, but has published no points formula. Every weight here is an assumption.
- The GM leaderboard is refreshed by gm.ink every few days, and the endpoint is not a documented public API, so it can change.
- Value held on Ink stands in for bridged volume.
- Wallets with more than 300 transactions are only partly read, so months and apps can be understated.
