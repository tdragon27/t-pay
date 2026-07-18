# Phantom Layout Reference for T Pay

Date: 2026-07-13
Scope: Home hierarchy and navigation decisions only

## Source quality

The official Phantom GitHub organization exposes SDKs, integration examples, demos, and supporting libraries. It does not expose the production Phantom mobile wallet UI as an open-source application. T Pay therefore uses Phantom's official product documentation and observable interaction model as reference, not unofficial clone repositories.

Official references:

- https://github.com/orgs/phantom/repositories
- https://github.com/phantom/phantom-connect-sdk
- https://help.phantom.com/hc/en-us/articles/46027382248467-Use-the-Home-tab-in-Phantom-on-mobile
- https://help.phantom.com/hc/en-us/articles/5530158379539-Send-crypto-in-Phantom
- https://help.phantom.com/hc/en-us/articles/6048249796243-Swap-tokens-in-Phantom

## Product thesis

T Pay is not a Phantom clone and not a trading dashboard. It is a social Arc Testnet payment wallet. Its top jobs remain:

1. Pay or receive an owned Arc asset safely.
2. Coordinate a request or split payment.
3. See what is pending, collected, or completed.

The useful Phantom pattern is `account -> balance -> actions -> assets -> contextual state`, while T Pay keeps Split and Business as differentiators.

## Claude brief reconciliation

| Proposal | Decision | Reason |
|---|---|---|
| Account-oriented top bar | Adopted | Reduces decorative branding and exposes wallet/network context immediately. |
| One dominant balance | Adopted | Money remains the strongest visual element. |
| Maximum four actions below balance | Adopted | Home now uses Pay, Request, Split, and Swap. |
| Separate token list | Adopted | Scales beyond three fixed chips and opens Send with the selected asset. |
| Progressive disclosure | Adopted | Send owns asset/recipient/amount/review; Home only provides shortcuts. |
| Exactly three bottom tabs | Rejected | This would hide Split/Business context and weaken T Pay's social-payment identity. Five stable destinations remain acceptable. |
| Explore as a top-level tab | Rejected | Trending tokens and dApps are trading/discovery jobs, not core T Pay jobs. No trustworthy live Explore data is currently connected. |
| Buy as a primary action | Rejected | No production on-ramp is connected and the app is testnet-only. Showing Buy would be misleading. |
| 24-hour token price changes | Rejected for now | T Pay has no canonical live price feed for every supported Arc Testnet asset; values must not be fabricated. |
| Settings only behind avatar | Partially adopted | Settings remains in the account header; Profile remains a valid tab because it also owns backup, security, contacts, notifications, and preferences. |
| No NFT entry points | Confirmed | T Pay does not expose NFT navigation or surfaces. |

## Implemented Home hierarchy

```text
Account header: T Pay, wallet, Arc status, Scan, Settings
Arc USDC balance
Pay | Request | Split | Swap
Assets: USDC, EURC, cirBTC
Contextual notice when action is required
Active payments
Latest activity preview
```

Asset rows show only real wallet balances. Selecting a row opens Send with the corresponding token preselected. Bridge and Contacts remain available in the Pay tab rather than competing on Home.

## Navigation retained

```text
Home      balance, assets, active payment state
Pay       canonical payment and funding task hub
Activity  canonical transaction history
Business  invoices, POS, recurring payments, payouts, analytics
Profile   wallet security, backup, preferences, support
```

## Visual direction

- One signature gradient balance surface.
- Glass reserved for floating controls and the tab bar.
- Quiet tonal surfaces for token rows and payment state.
- One cyan accent; violet and green only distinguish action families or semantic state.
- No looping animation on repeated financial cards.

## Provisional post-pass score

The updated hierarchy is provisionally **76.5 / 100**, up from the 67.8 baseline. The largest gains are in product fit, information architecture, and visual hierarchy. This score remains provisional until Home is inspected on a small iPhone and a lower-end Android device with loading, empty, offline, and funded wallet states.

## Acceptance checks

- A first-time viewer can identify balance, Pay, Request, Split, and owned assets within three seconds.
- Home shows no unsupported Buy or Explore action.
- No fake fiat value or 24-hour percentage is shown.
- Every Home token row opens Send with the correct token parameter.
- Scan, Bridge, Business, Activity, and Profile remain reachable.
- Reduce Motion and screen-reader verification remain part of device QA.
