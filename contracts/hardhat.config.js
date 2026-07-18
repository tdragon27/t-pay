require("@nomicfoundation/hardhat-toolbox");
require("dotenv/config");

const ARC_RPC_URL = process.env.ARC_RPC_URL || process.env.EXPO_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network";
const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || process.env.EXPO_PUBLIC_ARC_CHAIN_ID || 5042002);
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {},
    arcTestnet: {
      url: ARC_RPC_URL,
      chainId: ARC_CHAIN_ID,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      arcTestnet: "blockscout",
    },
    customChains: [
      {
        network: "arcTestnet",
        chainId: ARC_CHAIN_ID,
        urls: {
          apiURL: "https://testnet.arcscan.app/api",
          browserURL: "https://testnet.arcscan.app",
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
};
