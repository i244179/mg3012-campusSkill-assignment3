/**
 * Migration 1 - deploy the CampusSkill contract (contracts/SmartContract.sol)
 *
 * Run with:   npx truffle migrate --network development
 * Redeploy:   npx truffle migrate --network development --reset
 *             (Truffle 5.11 keeps no Migrations.sol record, so every migrate
 *              deploys a NEW instance; run `npm run sync` afterwards.)
 *
 * artifacts.require() takes the CONTRACT name ("CampusSkill"), not the file
 * name. Truffle reads the compiled artifact from build/contracts/CampusSkill.json.
 *
 * After deployment Truffle records the contract address under
 * build/contracts/CampusSkill.json -> networks[<Ganache network id>].address.
 * `npm run migrate` then runs scripts/sync-frontend.js, which copies that
 * address and the ABI into src/contract-config.js for the frontend.
 */
const CampusSkill = artifacts.require("CampusSkill");

module.exports = async function (deployer, network, accounts) {
  // The constructor takes no arguments. The first Ganache account pays for gas.
  await deployer.deploy(CampusSkill);

  const campusSkill = await CampusSkill.deployed();
  const count = await campusSkill.getMilestoneCount();

  console.log("\n  CampusSkill deployed");
  console.log("  ---------------------");
  console.log(`  Network         : ${network}`);
  console.log(`  Deployer        : ${accounts[0]}`);
  console.log(`  Contract address: ${campusSkill.address}`);
  console.log(`  Milestone count : ${count.toString()}\n`);
};
