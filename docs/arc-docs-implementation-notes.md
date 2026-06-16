# Arc Docs Implementation Notes

Checked on 2026-05-16.

## MCP Status

The project contains `.codex/mcp.json` pointing at `https://docs.arc.io/mcp`.
In the current Codex session, the MCP resource list returned empty, so the
server likely needs a Codex/project restart before it appears in tool context.

Official docs were still checked from:

- https://docs.arc.io/llms.txt
- https://docs.arc.io/integrate/connect-to-arc
- https://docs.arc.io/arc/references/contract-addresses
- https://docs.arc.io/app-kit
- https://docs.arc.io/app-kit/bridge
- https://docs.arc.io/app-kit/send
- https://docs.arc.io/app-kit/tutorials/swap/estimate-swap-rate

## Confirmed Arc Testnet Facts

- Arc is testnet-only in this project.
- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- WebSocket: `wss://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Faucet: `https://faucet.circle.com`
- Native gas token: USDC, 18 decimals for native gas accounting.
- ERC-20 USDC interface: `0x3600000000000000000000000000000000000000`, 6 decimals.
- EURC: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`, 6 decimals.
- CCTP domain for Arc Testnet: `26`.

## Implementation Changes

- `constants/chains.ts` now centralizes Arc docs links, network defaults, and confirmed official contract addresses.
- `EXPO_PUBLIC_ARC_EURC_ADDRESS` is documented and set from the official contract-addresses page.
- `lib/arcAppKit.ts` no longer returns fake bridge transaction hashes.
- `app/bridge.tsx` disables live bridge execution until Arc App Kit is wired.
- `hooks/useSend.ts` includes implementation notes that direct ERC-20 sends are a fallback until App Kit Send is integrated.

## Safe Next Step

Install and wire Arc App Kit only after confirming package access and API shape:

```powershell
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2
```

Then replace bridge, swap, send, and unified balance flows with App Kit calls.
