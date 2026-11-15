/**
 * Truffle tests for CampusSkill (contracts/SmartContract.sol)
 *
 * Run with Ganache running:   npx truffle test --network development
 *                       or:   npm test
 *
 * Truffle runs these with Mocha + Chai. `contract()` gives each test file the
 * Ganache accounts; every test below deploys a fresh contract with
 * CampusSkill.new(), so tests never depend on each other or on the migration.
 */
// `artifacts`, `contract`, `web3` and Chai's `assert` are globals provided by Truffle.
const CampusSkill = artifacts.require("CampusSkill");

/**
 * Expect a transaction or call to revert with a specific Solidity custom error.
 * Truffle reports custom errors as raw ABI data, so we look up the error in the
 * contract ABI, find its 4-byte selector in the error data, and decode the
 * arguments. Returns the decoded arguments for further checks.
 */
async function expectCustomError(promise, errorName) {
  const errorAbi = CampusSkill.abi.find((item) => item.type === "error" && item.name === errorName);
  assert.isOk(errorAbi, `error ${errorName} is not in the ABI`);
  const signature = `${errorName}(${errorAbi.inputs.map((i) => i.type).join(",")})`;
  const selector = web3.eth.abi.encodeFunctionSignature(signature).slice(2).toLowerCase();

  try {
    await promise;
  } catch (error) {
    const haystack = JSON.stringify(error.data || "") + " " + String(error.message);
    const match = haystack.toLowerCase().match(new RegExp(`0x${selector}([0-9a-f]*)`));
    assert.isOk(match, `expected custom error ${errorName}, got: ${error.message}`);
    return errorAbi.inputs.length
      ? web3.eth.abi.decodeParameters(errorAbi.inputs.map((i) => i.type), `0x${match[1]}`)
      : {};
  }
  assert.fail(`expected ${errorName} revert, but the call succeeded`);
}

/** Block timestamp of the block that mined a transaction receipt. */
async function blockTime(receipt) {
  const block = await web3.eth.getBlock(receipt.receipt.blockNumber);
  return Number(block.timestamp);
}

contract("CampusSkill", (accounts) => {
  const [alice, bob] = accounts;
  let campusSkill;

  beforeEach(async () => {
    campusSkill = await CampusSkill.new({ from: alice });
  });

  describe("deployment", () => {
    it("deploys and has a contract address", async () => {
      assert.match(campusSkill.address, /^0x[0-9a-fA-F]{40}$/);
      const code = await web3.eth.getCode(campusSkill.address);
      assert.notEqual(code, "0x", "no bytecode at the deployed address");
    });

    it("the migrated instance (truffle migrate) exists too", async () => {
      const migrated = await CampusSkill.deployed();
      assert.match(migrated.address, /^0x[0-9a-fA-F]{40}$/);
    });

    it("exposes exactly the four application functions", async () => {
      const names = CampusSkill.abi.filter((i) => i.type === "function").map((f) => f.name).sort();
      assert.deepEqual(names, ["completeMilestone", "createMilestone", "getMilestone", "getMilestoneCount"]);
    });

    it("starts with a milestone count of 0", async () => {
      assert.equal((await campusSkill.getMilestoneCount()).toString(), "0");
    });
  });

  describe("createMilestone / getMilestone", () => {
    it("stores every field and emits MilestoneCreated", async () => {
      const tx = await campusSkill.createMilestone("Learned Truffle", "Compiled and migrated to Ganache.", { from: alice });
      const created = await blockTime(tx);

      const event = tx.logs.find((l) => l.event === "MilestoneCreated");
      assert.isOk(event, "MilestoneCreated not emitted");
      assert.equal(event.args.id.toString(), "1");
      assert.equal(event.args.creator, alice);
      assert.equal(event.args.title, "Learned Truffle");
      assert.equal(event.args.createdAt.toString(), String(created));

      const m = await campusSkill.getMilestone(1);
      assert.equal(m.id.toString(), "1");
      assert.equal(m.title, "Learned Truffle");
      assert.equal(m.description, "Compiled and migrated to Ganache.");
      assert.equal(m.creator, alice, "creator must be msg.sender");
      assert.equal(m.createdAt.toString(), String(created), "createdAt must be the block timestamp");
      assert.equal(m.completed, false);
      assert.equal(m.completedAt.toString(), "0");
    });

    it("returns the new id from a call and assigns sequential unique ids", async () => {
      const predicted = await campusSkill.createMilestone.call("First", "One", { from: alice });
      assert.equal(predicted.toString(), "1");

      await campusSkill.createMilestone("First", "One", { from: alice });
      await campusSkill.createMilestone("Second", "Two", { from: bob });
      await campusSkill.createMilestone("Third", "Three", { from: alice });

      assert.equal((await campusSkill.getMilestoneCount()).toString(), "3");
      const ids = [];
      for (let i = 1; i <= 3; i++) ids.push((await campusSkill.getMilestone(i)).id.toString());
      assert.deepEqual(ids, ["1", "2", "3"]);
      assert.equal((await campusSkill.getMilestone(2)).creator, bob, "each milestone keeps its own creator");
    });

    it("rejects an empty title (EmptyTitle)", async () => {
      await expectCustomError(campusSkill.createMilestone("", "desc", { from: alice }), "EmptyTitle");
    });

    it("rejects an empty description (EmptyDescription)", async () => {
      await expectCustomError(campusSkill.createMilestone("title", "", { from: alice }), "EmptyDescription");
    });

    it("rejects a title over 80 bytes (TitleTooLong) and accepts exactly 80", async () => {
      const args = await expectCustomError(campusSkill.createMilestone("x".repeat(81), "d", { from: alice }), "TitleTooLong");
      assert.equal(args[0].toString(), "81");
      assert.equal(args[1].toString(), "80");
      await campusSkill.createMilestone("x".repeat(80), "d", { from: alice });
    });

    it("rejects a description over 280 bytes (DescriptionTooLong) and accepts exactly 280", async () => {
      await expectCustomError(campusSkill.createMilestone("t", "y".repeat(281), { from: alice }), "DescriptionTooLong");
      await campusSkill.createMilestone("t", "y".repeat(280), { from: alice });
    });

    it("rejected calls do not change the count", async () => {
      await expectCustomError(campusSkill.createMilestone("", "", { from: alice }), "EmptyTitle");
      assert.equal((await campusSkill.getMilestoneCount()).toString(), "0");
    });
  });

  describe("completeMilestone", () => {
    beforeEach(async () => {
      await campusSkill.createMilestone("Studied Ganache", "Local test chain.", { from: alice });
    });

    it("lets the creator complete it, records completedAt and emits MilestoneCompleted", async () => {
      const tx = await campusSkill.completeMilestone(1, { from: alice });
      const completed = await blockTime(tx);

      const m = await campusSkill.getMilestone(1);
      assert.equal(m.completed, true);
      assert.equal(m.completedAt.toString(), String(completed), "completedAt must be the block timestamp");
      assert.isAtLeast(Number(m.completedAt), Number(m.createdAt));
      assert.equal(m.title, "Studied Ganache", "the record is kept after completion");

      const event = tx.logs.find((l) => l.event === "MilestoneCompleted");
      assert.isOk(event, "MilestoneCompleted not emitted");
      assert.equal(event.args.id.toString(), "1");
      assert.equal(event.args.creator, alice);
      assert.equal(event.args.completedAt.toString(), String(completed));
    });

    it("prevents another wallet from completing it (NotMilestoneCreator)", async () => {
      const args = await expectCustomError(campusSkill.completeMilestone(1, { from: bob }), "NotMilestoneCreator");
      assert.equal(args[0].toString(), "1");
      assert.equal(args[1].toLowerCase(), bob.toLowerCase());
      assert.equal((await campusSkill.getMilestone(1)).completed, false, "state must not change");
    });

    it("prevents completing it twice (MilestoneAlreadyCompleted)", async () => {
      await campusSkill.completeMilestone(1, { from: alice });
      await expectCustomError(campusSkill.completeMilestone(1, { from: alice }), "MilestoneAlreadyCompleted");
    });
  });

  describe("invalid ids", () => {
    it("rejects id 0 and ids above the count for reads and writes (MilestoneNotFound)", async () => {
      await campusSkill.createMilestone("Only one", "d", { from: alice });
      await expectCustomError(campusSkill.getMilestone(0), "MilestoneNotFound");
      const args = await expectCustomError(campusSkill.getMilestone(2), "MilestoneNotFound");
      assert.equal(args[0].toString(), "2");
      await expectCustomError(campusSkill.completeMilestone(0, { from: alice }), "MilestoneNotFound");
      await expectCustomError(campusSkill.completeMilestone(99, { from: alice }), "MilestoneNotFound");
    });
  });
});
