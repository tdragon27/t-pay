# Security Policy

T Pay is an Arc Testnet-only wallet and payment coordination app. It should not be used with mainnet funds.

## Reporting A Vulnerability

If you find a security issue, please open a private report through GitHub Security Advisories if available, or contact the maintainer privately before posting public exploit details.

Please include:

- A short description of the issue.
- Impacted files or flows.
- Steps to reproduce.
- Whether funds, seed phrases, private keys, API keys, or transaction signing are affected.

Do not include real seed phrases, private keys, or production API keys in reports.

## Security Expectations

- Never commit `.env`, `.env.local`, `contracts/.env`, seed phrases, deployer private keys, or backend API secrets.
- Treat all `EXPO_PUBLIC_*` values as public because they are bundled into the mobile app.
- Keep wallet export, send, swap, invoice cancel, and sensitive actions behind PIN or biometric confirmation.
- Keep this project on Arc Testnet only until a separate production security review is complete.

## Current Limitations

- This repository is demo/testnet oriented.
- Community Picks and payment experiments require legal, compliance, oracle, abuse-prevention, and jurisdiction review before any mainnet use.
- Optional backend samples are not a hardened production backend by default.
