/**
 * CampusSkill - Assignment 3 frontend logic (src/script.js)
 *
 * Talks to the CampusSkill contract that Truffle deployed on a local Ganache
 * blockchain, using ethers.js v6.
 *
 *  - ABI + address come from src/contract-config.js, which
 *    scripts/sync-frontend.js generates from build/contracts/CampusSkill.json
 *    (the Truffle artifact). Nothing is copied by hand.
 *  - Reads and writes go to Ganache's JSON-RPC endpoint (default
 *    http://127.0.0.1:7545). Ganache's test accounts are unlocked, so
 *    transactions are sent with eth_sendTransaction from the selected account.
 *    No private keys are used or stored anywhere in this project.
 */
(() => {
  "use strict";

  const MAX_TITLE_BYTES = 80;          // must match MAX_TITLE_LENGTH in SmartContract.sol
  const MAX_DESCRIPTION_BYTES = 280;   // must match MAX_DESCRIPTION_LENGTH
  const POLL_MS = 3000;                // how often to check Ganache for new blocks
  const ACCOUNT_KEY = "campusskill.a3.account";

  const ethersLib = window.ethers;
  const CONFIG = window.CAMPUSSKILL_CONFIG || null;

  // ===================================================================
  // DOM references (fail loudly if the HTML and script ever drift apart)
  // ===================================================================
  const $ = (id) => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`CampusSkill: missing DOM element #${id}`);
    return node;
  };
  const dom = {
    networkLabel: $("networkLabel"), networkDot: $("networkDot"),
    accountSelect: $("accountSelect"), walletDot: $("walletDot"),
    reconnectBtn: $("reconnectBtn"), bannerArea: $("bannerArea"),
    statTotal: $("statTotal"), statCompleted: $("statCompleted"), statPending: $("statPending"),
    barCompleted: $("barCompleted"), barPending: $("barPending"),
    filterGroup: $("filterGroup"), sortBtn: $("sortBtn"), refreshBtn: $("refreshBtn"),
    syncNote: $("syncNote"), timeline: $("timelineContainer"), eventLog: $("eventLog"),
    progressRing: $("progressRing"), ringFill: $("ringFill"), ringPercent: $("ringPercent"),
    profileAddress: $("profileAddress"), myCompleted: $("myCompleted"), myPending: $("myPending"), myBalance: $("myBalance"),
    createForm: $("createForm"), titleInput: $("titleInput"), descInput: $("descInput"),
    titleCounter: $("titleCounter"), descCounter: $("descCounter"),
    titleError: $("titleError"), descError: $("descError"), createBtn: $("createBtn"),
    txStatus: $("txStatus"), txMessage: $("txMessage"), txSteps: $("txSteps"),
    txDetails: $("txDetails"), activityList: $("activityList"),
    chainDetails: $("chainDetails"), toastRegion: $("toastRegion"),
  };

  // ===================================================================
  // State - the blockchain is the only source of truth for milestones
  // ===================================================================
  const state = {
    provider: null,
    readContract: null,
    connected: false,
    connecting: false,
    connError: null,          // { title, message } when Ganache / contract is unusable
    networkId: null,
    chainId: null,
    blockNumber: null,
    accounts: [],
    account: null,
    balance: null,
    milestones: [],
    events: [],
    loaded: false,
    loading: false,
    loadError: null,
    lastSynced: null,
    filter: "all",
    newestFirst: true,
    txBusy: false,
    pendingCompleteId: null,
    highlightId: null,
    activity: [],
    pollTimer: null,
  };

  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "medium" });
  const textEncoder = new TextEncoder();

  // ===================================================================
  // Helpers
  // ===================================================================

  /** Safe DOM builder: text always goes in as text nodes, never as HTML. */
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of [].concat(children)) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  const shortAddress = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
  const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "");
  const byteLength = (s) => textEncoder.encode(s).length;
  const sameAddress = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const formatTimestamp = (seconds) => (seconds && seconds > 0n ? dateFormat.format(new Date(Number(seconds) * 1000)) : "—");
  const accountIndex = (address) => state.accounts.findIndex((a) => sameAddress(a, address));
  const accountName = (address) => {
    const i = accountIndex(address);
    return i >= 0 ? `Account ${i} (${shortAddress(address)})` : shortAddress(address);
  };

  function withTimeout(promise, ms, message) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(message), { code: "TIMEOUT" })), ms); }),
    ]).finally(() => clearTimeout(timer));
  }

  function setButtonLoading(button, loading, label) {
    button.classList.toggle("is-loading", loading);
    button.setAttribute("aria-busy", String(loading));
    const text = button.querySelector(".btn-text");
    if (label && text) text.textContent = label;
  }

  function saveAccountChoice(address) {
    try { localStorage.setItem(ACCOUNT_KEY, address); } catch { /* storage unavailable: ignore */ }
  }
  function loadAccountChoice() {
    try { return localStorage.getItem(ACCOUNT_KEY); } catch { return null; }
  }

  /** An error that already carries a friendly title and message. */
  class AppError extends Error {
    constructor(title, message) { super(message); this.friendly = { title, message }; }
  }

  // ===================================================================
  // Error handling
  // ===================================================================
  let contractInterface = null;

  /** Walk any error object looking for ABI-encoded custom error data and decode it. */
  function findCustomError(err, depth = 0, seen = new Set()) {
    if (!contractInterface || err === null || err === undefined || depth > 7) return null;
    if (typeof err === "string") {
      const match = err.match(/0x[0-9a-fA-F]{8,}/);
      if (match) { try { return contractInterface.parseError(match[0]); } catch { return null; } }
      return null;
    }
    if (typeof err !== "object" || seen.has(err)) return null;
    seen.add(err);
    if (err.revert && err.revert.name) return err.revert;
    for (const key of Object.keys(err)) {
      const found = findCustomError(err[key], depth + 1, seen);
      if (found) return found;
    }
    return null;
  }

  function errorText(err, depth = 0, seen = new Set()) {
    if (!err || typeof err !== "object" || depth > 6 || seen.has(err)) return "";
    seen.add(err);
    let text = "";
    for (const key of ["message", "shortMessage", "reason"]) if (typeof err[key] === "string") text += ` ${err[key]}`;
    for (const key of ["error", "info", "cause"]) text += errorText(err[key], depth + 1, seen);
    return text;
  }

  function friendlyError(err) {
    if (err && err.friendly) return err.friendly;
    const custom = findCustomError(err);
    if (custom) {
      const [a, b] = custom.args || [];
      switch (custom.name) {
        case "EmptyTitle": return { title: "Title is required", message: "The contract rejected an empty title." };
        case "EmptyDescription": return { title: "Description is required", message: "The contract rejected an empty description." };
        case "TitleTooLong": return { title: "Title is too long", message: `The title is ${a} bytes; the contract allows at most ${b}.` };
        case "DescriptionTooLong": return { title: "Description is too long", message: `The description is ${a} bytes; the contract allows at most ${b}.` };
        case "MilestoneNotFound": return { title: "Milestone not found", message: `Milestone #${a} does not exist on this contract.` };
        case "NotMilestoneCreator": return { title: "Not your milestone", message: `Only the account that created milestone #${a} can complete it. ${accountName(b)} is not the creator.` };
        case "MilestoneAlreadyCompleted": return { title: "Already completed", message: `Milestone #${a} is already marked as completed.` };
        default: return { title: "Contract rejected the transaction", message: custom.name };
      }
    }
    const text = errorText(err).toLowerCase();
    const code = err && err.code;
    if (code === "INSUFFICIENT_FUNDS" || text.includes("insufficient funds")) {
      return { title: "Not enough ETH", message: "The selected Ganache account cannot pay for gas. Pick another account." };
    }
    if (text.includes("sender account not recognized") || text.includes("unknown account")) {
      return { title: "Account not unlocked", message: "Ganache does not control this account. Pick one of the Ganache accounts in the list." };
    }
    if (["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT"].includes(code) || text.includes("failed to fetch") || text.includes("econnrefused")) {
      return { title: "Cannot reach Ganache", message: `No response from ${CONFIG ? CONFIG.rpcUrl : "Ganache"}. Make sure Ganache is running, then click Reconnect.` };
    }
    if (code === "CALL_EXCEPTION") {
      return { title: "Transaction reverted", message: "The contract rejected this call. Click Refresh and try again." };
    }
    if (code === "BAD_DATA") {
      return { title: "Unexpected contract response", message: "The configured address did not return CampusSkill data. Run npm run migrate:reset." };
    }
    return { title: "Something went wrong", message: (err && (err.shortMessage || err.message)) || String(err) };
  }

  function toast(title, message, kind = "info") {
    const node = el("div", { class: `toast ${kind}` }, [el("strong", { text: title }), message ? el("span", { text: message }) : null]);
    dom.toastRegion.append(node);
    setTimeout(() => node.remove(), kind === "error" ? 9000 : 5000);
  }

  // ===================================================================
  // Connecting to Ganache and the Truffle deployment
  // ===================================================================
  async function connect() {
    if (state.connecting) return;
    state.connecting = true;
    setButtonLoading(dom.reconnectBtn, true, "Connecting…");
    dom.reconnectBtn.disabled = true;
    stopPolling();
    try {
      if (!ethersLib) throw new AppError("ethers.js did not load", "The page needs an internet connection the first time to load ethers.js from the jsDelivr CDN.");
      if (!CONFIG || !CONFIG.address || !Array.isArray(CONFIG.abi)) {
        throw new AppError("Contract not deployed yet",
          "src/contract-config.js has no deployment. With Ganache running, run: npx truffle migrate --network development, then npm run sync (or just npm run migrate). Then reload this page.");
      }
      contractInterface = new ethersLib.Interface(CONFIG.abi);

      if (state.provider) state.provider.destroy();
      const provider = new ethersLib.JsonRpcProvider(CONFIG.rpcUrl, Number(CONFIG.chainId), { staticNetwork: true });
      provider.pollingInterval = 500; // Ganache mines instantly; check receipts quickly

      let networkId, blockNumber;
      try {
        [networkId, blockNumber] = await withTimeout(
          Promise.all([provider.send("net_version", []), provider.getBlockNumber()]), 6000, "Ganache timeout");
      } catch (err) {
        provider.destroy();
        throw new AppError("Cannot reach Ganache", `Nothing answered at ${CONFIG.rpcUrl}. Start Ganache (npm run ganache, or open Ganache GUI) and click Reconnect.`);
      }
      if (String(networkId) !== String(CONFIG.networkId)) {
        provider.destroy();
        throw new AppError("Different Ganache network",
          `Ganache is running network ${networkId}, but the contract was deployed to network ${CONFIG.networkId}. Run npm run migrate:reset, then reload.`);
      }
      const code = await provider.getCode(CONFIG.address);
      if (!code || code === "0x") {
        provider.destroy();
        throw new AppError("Contract not found on Ganache",
          `There is no contract at ${CONFIG.address}. Ganache was probably restarted with a fresh chain. Run npm run migrate:reset, then reload.`);
      }
      const accounts = (await provider.send("eth_accounts", [])).map((a) => ethersLib.getAddress(a));
      if (!accounts.length) {
        provider.destroy();
        throw new AppError("No Ganache accounts", "Ganache returned no unlocked accounts to send transactions from.");
      }

      state.provider = provider;
      state.readContract = new ethersLib.Contract(CONFIG.address, CONFIG.abi, provider);
      state.networkId = String(networkId);
      state.chainId = Number(CONFIG.chainId);
      state.blockNumber = blockNumber;
      state.accounts = accounts;
      const remembered = loadAccountChoice();
      state.account = accounts.find((a) => sameAddress(a, remembered)) || accounts[0];
      state.connected = true;
      state.connError = null;

      renderAccounts();
      await Promise.all([loadMilestones(), loadEvents(), loadBalance()]);
      startPolling();
    } catch (err) {
      state.connected = false;
      state.connError = friendlyError(err);
      state.loaded = true;
    } finally {
      state.connecting = false;
      setButtonLoading(dom.reconnectBtn, false, "Reconnect");
      dom.reconnectBtn.disabled = false;
      renderAll();
    }
  }

  /** Poll Ganache: pick up blocks mined elsewhere (e.g. from `truffle console`) and detect a stopped Ganache. */
  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(async () => {
      if (!state.provider || state.txBusy || state.loading) return;
      try {
        const block = await withTimeout(state.provider.getBlockNumber(), 4000, "poll timeout");
        if (block !== state.blockNumber) {
          state.blockNumber = block;
          await Promise.all([loadMilestones(), loadEvents(), loadBalance()]);
        }
      } catch (err) {
        stopPolling();
        state.connected = false;
        state.connError = { title: "Lost connection to Ganache", message: `${CONFIG.rpcUrl} stopped responding. Restart Ganache and click Reconnect.` };
        renderAll();
      }
    }, POLL_MS);
  }
  function stopPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  // ===================================================================
  // Reading contract data
  // ===================================================================
  let loadSequence = 0;

  async function loadMilestones() {
    if (!state.readContract) return;
    const sequence = ++loadSequence;
    state.loading = true;
    setButtonLoading(dom.refreshBtn, true);
    renderTimeline();
    try {
      const count = await state.readContract.getMilestoneCount();          // BigInt
      const ids = [];
      for (let id = 1n; id <= count; id++) ids.push(id);                    // valid ids are 1..count
      const records = [];
      for (let i = 0; i < ids.length; i += 10) {
        records.push(...(await Promise.all(ids.slice(i, i + 10).map((id) => state.readContract.getMilestone(id)))));
      }
      if (sequence !== loadSequence) return;
      state.milestones = records.map((m) => ({
        id: m.id, title: m.title, description: m.description,
        creator: ethersLib.getAddress(m.creator),
        createdAt: m.createdAt, completed: m.completed, completedAt: m.completedAt,
      }));
      state.loadError = null;
      state.lastSynced = new Date();
    } catch (err) {
      if (sequence !== loadSequence) return;
      state.loadError = friendlyError(err);
    } finally {
      if (sequence === loadSequence) {
        state.loading = false;
        state.loaded = true;
        setButtonLoading(dom.refreshBtn, false);
        renderAll();
      }
    }
  }

  async function loadEvents() {
    if (!state.readContract) return;
    try {
      const [created, completed] = await Promise.all([
        state.readContract.queryFilter(state.readContract.filters.MilestoneCreated(), 0, "latest"),
        state.readContract.queryFilter(state.readContract.filters.MilestoneCompleted(), 0, "latest"),
      ]);
      state.events = [...created, ...completed].sort((a, b) =>
        b.blockNumber - a.blockNumber || b.index - a.index);
    } catch (err) {
      state.events = [];
    }
    renderEvents();
  }

  async function loadBalance() {
    if (!state.provider || !state.account) return;
    try { state.balance = await state.provider.getBalance(state.account); } catch { state.balance = null; }
    renderProfile();
  }

  // ===================================================================
  // Writing contract data
  // ===================================================================

  /** Send a transaction from the selected Ganache account and wait until it is mined. */
  async function runTransaction(label, send) {
    if (state.txBusy) { toast("Transaction in progress", "Wait for the current transaction to finish.", "info"); return null; }
    if (!state.connected) { toast("Not connected", "Connect to Ganache first (Reconnect button).", "error"); return null; }
    state.txBusy = true;
    renderBusy();
    const entry = { label, hash: null, status: "pending", from: state.account };
    let stage = "sign";
    try {
      setTx({ state: "pending", message: `${label}: sending from ${accountName(state.account)}…`, steps: { sign: "active" } });
      const signer = await state.provider.getSigner(state.account);   // Ganache-unlocked account
      const contract = state.readContract.connect(signer);
      const tx = await send(contract);                                 // TransactionResponse

      stage = "submit";
      entry.hash = tx.hash;
      state.activity.unshift(entry);
      renderActivity();
      setTx({ state: "pending", message: `${label}: waiting for Ganache to mine it…`, steps: { sign: "done", submit: "active" }, hash: tx.hash });

      const receipt = await tx.wait(1);                                // TransactionReceipt
      if (!receipt || receipt.status !== 1) throw new AppError("Transaction failed", "The transaction was mined but reverted.");

      entry.status = "confirmed";
      setTx({
        state: "success",
        message: `${label}: mined in block ${receipt.blockNumber}.`,
        steps: { sign: "done", submit: "done", confirm: "done" },
        hash: tx.hash, block: receipt.blockNumber, gasUsed: receipt.gasUsed, from: state.account,
      });
      state.blockNumber = receipt.blockNumber;
      return { receipt, contract };
    } catch (err) {
      entry.status = "failed";
      const f = friendlyError(err);
      setTx({ state: "error", message: `${f.title}. ${f.message}`, steps: stage === "sign" ? { sign: "failed" } : { sign: "done", submit: "done", confirm: "failed" }, hash: entry.hash });
      toast(f.title, f.message, "error");
      return null;
    } finally {
      state.txBusy = false;
      renderBusy();
      renderActivity();
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!validateForm(true)) { toast("Check the form", "Fix the highlighted fields first.", "error"); return; }
    const title = dom.titleInput.value.trim();
    const description = dom.descInput.value.trim();
    setButtonLoading(dom.createBtn, true, "Publishing…");
    const result = await runTransaction("Create milestone", (c) => c.createMilestone(title, description));
    setButtonLoading(dom.createBtn, false, "Publish milestone");
    if (!result) return;

    let newId = null;
    for (const log of result.receipt.logs) {
      try {
        const parsed = contractInterface.parseLog(log);
        if (parsed && parsed.name === "MilestoneCreated") newId = parsed.args.id;
      } catch { /* not a CampusSkill log */ }
    }
    dom.createForm.reset();
    updateCounters();
    clearFieldErrors();
    state.highlightId = newId;
    state.filter = "all";
    toast("Milestone published", newId !== null ? `Milestone #${newId} is now stored on Ganache.` : "Your milestone is stored on Ganache.", "success");
    await Promise.all([loadMilestones(), loadEvents(), loadBalance()]);
  }

  async function handleComplete(milestoneId) {
    const milestone = state.milestones.find((m) => m.id === milestoneId);
    if (!milestone) return;
    if (milestone.completed) { toast("Already completed", `Milestone #${milestoneId} is already completed.`, "info"); return; }
    state.pendingCompleteId = milestoneId;
    renderTimeline();
    const result = await runTransaction(`Complete #${milestoneId}`, (c) => c.completeMilestone(milestoneId));
    state.pendingCompleteId = null;
    if (result) {
      state.highlightId = milestoneId;
      toast("Milestone completed", `Milestone #${milestoneId} is now marked as completed on-chain.`, "success");
      await Promise.all([loadMilestones(), loadEvents(), loadBalance()]);
    } else {
      renderTimeline();
    }
  }

  // ===================================================================
  // Form validation
  // ===================================================================
  function updateCounters() {
    const t = byteLength(dom.titleInput.value.trim());
    const d = byteLength(dom.descInput.value.trim());
    dom.titleCounter.textContent = `${t} / ${MAX_TITLE_BYTES}`;
    dom.descCounter.textContent = `${d} / ${MAX_DESCRIPTION_BYTES}`;
    dom.titleCounter.classList.toggle("over", t > MAX_TITLE_BYTES);
    dom.descCounter.classList.toggle("over", d > MAX_DESCRIPTION_BYTES);
  }
  function setFieldError(input, node, message) {
    node.textContent = message || "";
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }
  function clearFieldErrors() {
    setFieldError(dom.titleInput, dom.titleError, "");
    setFieldError(dom.descInput, dom.descError, "");
  }
  function validateForm(showEmpty) {
    const title = dom.titleInput.value.trim();
    const description = dom.descInput.value.trim();
    let titleMsg = "";
    let descMsg = "";
    if (!title) titleMsg = showEmpty ? "Enter a milestone title." : "";
    else if (byteLength(title) > MAX_TITLE_BYTES) titleMsg = `Title must be ${MAX_TITLE_BYTES} bytes or fewer.`;
    if (!description) descMsg = showEmpty ? "Describe what you learned or built." : "";
    else if (byteLength(description) > MAX_DESCRIPTION_BYTES) descMsg = `Description must be ${MAX_DESCRIPTION_BYTES} bytes or fewer.`;
    setFieldError(dom.titleInput, dom.titleError, titleMsg);
    setFieldError(dom.descInput, dom.descError, descMsg);
    if (showEmpty && titleMsg) dom.titleInput.focus();
    else if (showEmpty && descMsg) dom.descInput.focus();
    return !titleMsg && !descMsg && !!title && !!description;
  }

  // ===================================================================
  // Rendering
  // ===================================================================
  function renderAll() {
    renderStatus();
    renderBanners();
    renderStats();
    renderProfile();
    renderTimeline();
    renderEvents();
    renderChainDetails();
    renderBusy();
  }

  function renderStatus() {
    if (state.connected) {
      dom.networkLabel.textContent = `Ganache · chain ${state.chainId}`;
      dom.networkDot.dataset.state = "ok";
      dom.walletDot.dataset.state = "ok";
    } else if (state.connecting) {
      dom.networkLabel.textContent = "Connecting…";
      dom.networkDot.dataset.state = "warn";
    } else {
      dom.networkLabel.textContent = "Not connected";
      dom.networkDot.dataset.state = "error";
      dom.walletDot.dataset.state = "error";
    }
    dom.accountSelect.disabled = !state.connected || state.txBusy;
  }

  function renderAccounts() {
    const options = state.accounts.map((address, i) =>
      el("option", { value: address, selected: sameAddress(address, state.account) }, `Account ${i} · ${shortAddress(address)}`));
    dom.accountSelect.replaceChildren(...options);
    dom.accountSelect.value = state.account;
  }

  function renderBanners() {
    const banners = [];
    if (state.connError) {
      banners.push(el("div", { class: "banner error", role: "alert" }, [
        el("div", { class: "banner-body" }, [
          el("strong", { class: "banner-title", text: state.connError.title }),
          state.connError.message,
        ]),
        el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Reconnect", onclick: connect }),
      ]));
    }
    dom.bannerArea.replaceChildren(...banners);
  }

  function renderStats() {
    const ready = state.connected && state.loaded && !state.loadError;
    const total = state.milestones.length;
    const completed = state.milestones.filter((m) => m.completed).length;
    const pending = total - completed;
    dom.statTotal.textContent = ready ? String(total) : "–";
    dom.statCompleted.textContent = ready ? String(completed) : "–";
    dom.statPending.textContent = ready ? String(pending) : "–";
    dom.barCompleted.style.width = ready && total ? `${(completed / total) * 100}%` : "0%";
    dom.barPending.style.width = ready && total ? `${(pending / total) * 100}%` : "0%";
  }

  function renderProfile() {
    const circumference = 2 * Math.PI * 54;
    if (!state.connected || !state.account) {
      dom.profileAddress.textContent = state.connError ? "Not connected to Ganache." : "Waiting for Ganache…";
      dom.ringPercent.textContent = "–";
      dom.ringFill.style.strokeDashoffset = String(circumference);
      dom.myCompleted.textContent = "0 completed";
      dom.myPending.textContent = "0 pending";
      dom.myBalance.textContent = "– ETH";
      return;
    }
    const mine = state.milestones.filter((m) => sameAddress(m.creator, state.account));
    const done = mine.filter((m) => m.completed).length;
    const pct = mine.length ? Math.round((done / mine.length) * 100) : 0;
    dom.profileAddress.textContent = state.account;
    dom.profileAddress.title = state.account;
    dom.ringPercent.textContent = `${pct}%`;
    dom.ringFill.style.strokeDashoffset = String(circumference * (1 - pct / 100));
    dom.myCompleted.textContent = `${done} completed`;
    dom.myPending.textContent = `${mine.length - done} pending`;
    dom.myBalance.textContent = state.balance === null ? "– ETH" : `${Number(ethersLib.formatEther(state.balance)).toFixed(4)} ETH`;
    dom.progressRing.setAttribute("aria-label", `Completion rate of ${accountName(state.account)}: ${pct}% (${done} of ${mine.length})`);
  }

  function filteredMilestones() {
    let list = state.milestones;
    if (state.filter === "mine") list = list.filter((m) => sameAddress(m.creator, state.account));
    else if (state.filter === "pending") list = list.filter((m) => !m.completed);
    else if (state.filter === "completed") list = list.filter((m) => m.completed);
    list = [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return state.newestFirst ? list.reverse() : list;
  }

  function emptyState(title, message, action) {
    return el("div", { class: "empty-state" }, [el("h3", { text: title }), el("p", { text: message }), action || null]);
  }

  function renderTimeline() {
    for (const button of dom.filterGroup.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.filter === state.filter));
    }
    dom.sortBtn.textContent = state.newestFirst ? "Newest first" : "Oldest first";
    dom.timeline.setAttribute("aria-busy", String(state.loading));
    dom.syncNote.textContent = state.lastSynced
      ? `Read from CampusSkill on Ganache · block ${state.blockNumber} · synced ${timeFormat.format(state.lastSynced)}`
      : "Milestones are read directly from the deployed contract.";

    if (state.connError) {
      dom.timeline.replaceChildren(emptyState(state.connError.title, state.connError.message,
        el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Reconnect", onclick: connect })));
      return;
    }
    if (!state.loaded) {
      dom.timeline.replaceChildren(el("div", { class: "timeline" }, [el("div", { class: "skeleton" }), el("div", { class: "skeleton" })]));
      return;
    }
    if (state.loadError) {
      dom.timeline.replaceChildren(emptyState(state.loadError.title, state.loadError.message,
        el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Try again", onclick: loadMilestones })));
      return;
    }
    const list = filteredMilestones();
    if (!list.length) {
      const none = state.milestones.length === 0;
      dom.timeline.replaceChildren(emptyState(
        none ? "No milestones yet" : "Nothing in this view",
        none ? "Publish the first milestone on your freshly migrated contract." : "Try another filter or pick another account.",
        none ? el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Create the first milestone", onclick: () => dom.titleInput.focus() }) : null));
      return;
    }
    dom.timeline.replaceChildren(el("ol", { class: "timeline", "aria-labelledby": "timelineTitle" }, list.map(renderMilestone)));
    if (state.highlightId !== null) {
      const target = dom.timeline.querySelector(`[data-milestone-id="${state.highlightId}"]`);
      if (target) { target.classList.add("is-new"); target.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
      state.highlightId = null;
    }
  }

  function renderMilestone(m) {
    const mine = sameAddress(m.creator, state.account);
    const completing = state.pendingCompleteId === m.id;
    let action;
    if (m.completed) {
      action = el("span", { class: "milestone-hint", text: `Completed ${formatTimestamp(m.completedAt)}` });
    } else if (mine) {
      action = [
        el("span", { class: "milestone-hint", text: "Created by the selected account." }),
        el("button", {
          type: "button", class: `btn btn-success btn-sm${completing ? " is-loading" : ""}`,
          "aria-label": `Mark milestone ${m.id} as completed`, disabled: state.txBusy,
          onclick: () => handleComplete(m.id),
        }, [el("span", { class: "spinner", "aria-hidden": "true" }), el("span", { class: "btn-text", text: completing ? "Completing…" : "Mark as completed" })]),
      ];
    } else {
      action = el("span", { class: "milestone-hint", text: `Only ${accountName(m.creator)} can complete this. Switch account to try.` });
    }

    return el("li", { class: `milestone ${m.completed ? "is-completed" : "is-pending"}`, dataset: { milestoneId: m.id.toString() } }, [
      el("div", { class: "milestone-top" }, [
        el("span", { class: "chip chip-id", text: `#${m.id}` }),
        el("span", { class: `chip ${m.completed ? "chip-completed" : "chip-pending"}`, text: m.completed ? "✓ Completed" : "◷ Pending" }),
        mine ? el("span", { class: "chip chip-mine", text: "Selected account" }) : null,
      ]),
      el("h3", { text: m.title }),
      el("p", { class: "milestone-desc", text: m.description }),
      el("dl", { class: "meta" }, [
        el("div", {}, [el("dt", { text: "Creator" }), el("dd", { class: "mono", title: m.creator, text: accountName(m.creator) })]),
        el("div", {}, [el("dt", { text: "Created" }), el("dd", { text: formatTimestamp(m.createdAt) })]),
        el("div", {}, [el("dt", { text: "Completed" }), el("dd", { class: m.completed ? "" : "muted", text: m.completed ? formatTimestamp(m.completedAt) : "Not yet" })]),
      ]),
      el("div", { class: "milestone-actions" }, action),
    ]);
  }

  function renderEvents() {
    if (!state.connected) { dom.eventLog.replaceChildren(el("li", { class: "event-empty", text: "Connect to Ganache to load events." })); return; }
    if (!state.events.length) { dom.eventLog.replaceChildren(el("li", { class: "event-empty", text: "No events yet. Publish a milestone to emit MilestoneCreated." })); return; }
    dom.eventLog.replaceChildren(...state.events.slice(0, 15).map((ev) => {
      const isCreated = ev.eventName === "MilestoneCreated" || (ev.fragment && ev.fragment.name === "MilestoneCreated");
      const name = isCreated ? "MilestoneCreated" : "MilestoneCompleted";
      const detail = isCreated
        ? `#${ev.args.id} "${ev.args.title}" by ${accountName(ev.args.creator)}`
        : `#${ev.args.id} completed by ${accountName(ev.args.creator)}`;
      return el("li", { class: `event-item ${isCreated ? "created" : "completed"}` }, [
        el("span", { class: "event-name", text: name }),
        el("span", { class: "event-detail", text: detail }),
        el("span", { class: "event-meta mono", title: ev.transactionHash, text: `block ${ev.blockNumber} · tx ${shortHash(ev.transactionHash)}` }),
      ]);
    }));
  }

  function renderChainDetails() {
    const rows = [];
    const row = (label, value, mono = true) => rows.push(el("div", {}, [el("dt", { text: label }), el("dd", { class: mono ? "" : "plain", text: value })]));
    if (CONFIG) {
      row("Contract", `${CONFIG.contractName} (contracts/${CONFIG.sourceFile})`, false);
      row("Contract address", CONFIG.address);
      if (CONFIG.transactionHash) row("Deployment transaction", CONFIG.transactionHash);
      row("Compiler", CONFIG.compiler || "solc", false);
      row("Ganache RPC", CONFIG.rpcUrl);
      row("Chain ID / network ID", `${CONFIG.chainId} / ${CONFIG.networkId}`);
      if (state.connected) row("Latest block", String(state.blockNumber));
      row("Synced from artifact", CONFIG.artifactUpdatedAt ? dateFormat.format(new Date(CONFIG.artifactUpdatedAt)) : "—", false);
    } else {
      row("Status", "No deployment yet. Run npm run migrate.", false);
    }
    dom.chainDetails.replaceChildren(...rows);
  }

  function renderBusy() {
    dom.createBtn.disabled = state.txBusy || !state.connected;
    dom.refreshBtn.disabled = state.loading || !state.connected;
    dom.accountSelect.disabled = !state.connected || state.txBusy;
    for (const button of dom.timeline.querySelectorAll(".milestone .btn-success")) button.disabled = state.txBusy;
  }

  function setTx({ state: txState, message, steps = {}, hash = null, block = null, gasUsed = null, from = null }) {
    dom.txStatus.dataset.state = txState;
    dom.txMessage.textContent = message;
    for (const li of dom.txSteps.querySelectorAll("li")) {
      const s = steps[li.dataset.step];
      if (s) li.dataset.state = s; else delete li.dataset.state;
    }
    const rows = [];
    const row = (label, value) => rows.push(el("div", {}, [el("dt", { text: label }), el("dd", { text: value })]));
    if (hash) row("Transaction hash", hash);
    if (from) row("From", accountName(from));
    if (block !== null) row("Block", String(block));
    if (gasUsed !== null) row("Gas used", gasUsed.toString());
    if (hash && txState === "success") row("Where to check", "Ganache GUI → Transactions tab, or the Ganache terminal log");
    dom.txDetails.replaceChildren(...rows);
  }

  function renderActivity() {
    dom.activityList.replaceChildren(...state.activity.slice(0, 6).map((a) => el("li", {}, [
      el("span", { class: "activity-label", title: a.hash, text: `${a.label} · ${shortHash(a.hash)}` }),
      el("span", {
        class: `activity-state ${a.status === "confirmed" ? "ok" : a.status === "failed" ? "bad" : ""}`,
        text: a.status === "confirmed" ? "Mined" : a.status === "failed" ? "Failed" : "Pending",
      }),
    ])));
  }

  // ===================================================================
  // Events
  // ===================================================================
  function bindEvents() {
    dom.reconnectBtn.addEventListener("click", connect);
    dom.refreshBtn.addEventListener("click", () => Promise.all([loadMilestones(), loadEvents(), loadBalance()]));
    dom.sortBtn.addEventListener("click", () => { state.newestFirst = !state.newestFirst; renderTimeline(); renderBusy(); });
    dom.filterGroup.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-filter]");
      if (!button) return;
      state.filter = button.dataset.filter;
      renderTimeline();
      renderBusy();
    });
    dom.accountSelect.addEventListener("change", async () => {
      state.account = dom.accountSelect.value;
      saveAccountChoice(state.account);
      toast("Account switched", `Now sending transactions from ${accountName(state.account)}.`, "info");
      renderAll();
      await loadBalance();
    });
    dom.createForm.addEventListener("submit", handleCreate);
    for (const input of [dom.titleInput, dom.descInput]) {
      input.addEventListener("input", () => { updateCounters(); validateForm(false); });
    }
  }

  bindEvents();
  updateCounters();
  renderAll();
  connect();
})();
