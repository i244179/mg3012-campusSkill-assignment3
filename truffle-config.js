/**
 * Truffle configuration - CampusSkill (MG3012 Assignment 3)
 *
 * Connects Truffle to a LOCAL Ganache blockchain.
 *
 *   Ganache GUI (Quickstart):  RPC Server  HTTP://127.0.0.1:7545,  Network ID 5777
 *   Ganache CLI (npm run ganache in this project): same values (127.0.0.1:7545, 5777)
 *
 * If your Ganache shows a different port, change GANACHE_PORT below
 * (or run with the environment variable GANACHE_PORT=8545, for example).
 * No private keys or mnemonics are stored here: Ganache's accounts are
 * unlocked, so Truffle can sign deployments through the RPC connection.
 */
const GANACHE_HOST = process.env.GANACHE_HOST || "127.0.0.1";
const GANACHE_PORT = Number(process.env.GANACHE_PORT) || 7545;

module.exports = {
  networks: {
    // Used by: truffle migrate --network development / truffle test / truffle console
    development: {
      host: GANACHE_HOST,
      port: GANACHE_PORT,
      network_id: "*", // match any network id (Ganache GUI uses 5777)
    },
  },

  // Mocha settings for `truffle test`
  mocha: {
    timeout: 100000,
  },

  compilers: {
    solc: {
      version: "0.8.20", // matches `pragma solidity ^0.8.20;` in contracts/SmartContract.sol
      settings: {
        optimizer: { enabled: false, runs: 200 },
        // "paris" avoids the PUSH0 opcode (added in "shanghai"), so the bytecode
        // also deploys on older Ganache versions such as Ganache GUI 2.7.x.
        evmVersion: "paris",
      },
    },
  },
};
