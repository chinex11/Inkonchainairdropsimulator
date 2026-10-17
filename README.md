# Ink Airdrop Checker (unofficial)

Paste a wallet address (and optionally a GitHub username and your X follower count). The page reads the
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
- **GitHub search API**: commits and merged PRs to the `inkonchain` org.
- **X**: not readable without a paid API key, so followers are typed in.

## Scoring (max 113, edit the tier tables at the top of `docs/checker.js`)

- Wallet activity 44: transactions 14, active months 10, apps 8, value held 8, early adopter 4
- Ink identity 7: .ink domain owned (ZNS Connect) up to 4, NFT collections held up to 3
- Ink DeFi and usage 16: Tydro lending deposit 6, Tydro borrowing 2, Tydro points held 2, token transfers 3, gas used 3
- Ink GM 15: leaderboard rank by percentile 10 (top 1% = 10, 5% = 8, 10% = 6, 25% = 4, 50% = 2, any rank = 1), streak 3, people greeted 2
- GitHub 20: commits 11, merged PRs 6, contracts deployed 3
- X reach 11: followers 9, account age 2

Two farming rules halve the score each: 200+ transactions to 2 or fewer apps, and 100+ transactions in the wallet's first week.

## Limits

- The Ink Foundation has confirmed an INK token (1B cap) and an airdrop, naming its Aave-based lending pool (Tydro) as the first route, but has published no points formula. Every weight here is an assumption.
- The GM leaderboard is refreshed by gm.ink every few days, and the endpoint is not a documented public API, so it can change.
- Value held on Ink stands in for bridged volume.
- Wallets with more than 300 transactions are only partly read, so months and apps can be understated.
- GitHub usernames are not verified as yours.
