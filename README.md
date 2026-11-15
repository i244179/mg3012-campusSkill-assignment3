# CampusSkill: Truffle & Ganache Edition

> The CampusSkill learning-milestone contract from Assignment 2, now compiled, tested and migrated with **Truffle** onto a local **Ganache** blockchain, with a frontend that reads the ABI and address straight from Truffle's build artifact.

| | |
|---|---|
| **Course** | MG3012 Blockchain Technology for Business |
| **Assignment** | Assignment 3: Building and Deploying Smart Contracts using Truffle & Ganache |
| **Program** | BSFT, 5th semester (Fall 2026), FAST-NUCES Islamabad |
| **Instructor** | Dr. Usama Arshad |
| **Student** | Maheen (24i-4179) |
| **Builds on** | Assignment 2, CampusSkill on Sepolia (`0xD7B366017de69acC7AC1003d7Ccd1eCEc791E81d`) |
| **Local network** | Ganache, RPC `http://127.0.0.1:7545`, chain ID `1337`, network ID `5777` |
| **GitHub** | https://github.com/i244179/mg3012-campusSkill-assignment3 |

---

## Contents
1. [Project overview](#1-project-overview)
2. [Problem statement](#2-problem-statement)
3. [Proposed solution](#3-proposed-solution)
4. [Objectives](#4-objectives)
5. [Main features](#5-main-features)
6. [Technology stack and versions](#6-technology-stack-and-versions)
7. [System architecture](#7-system-architecture)
8. [Folder structure](#8-folder-structure)
9. [Smart contract](#9-smart-contract)
10. [Contract functions](#10-contract-functions)
11. [Events and access control](#11-events-and-access-control)
12. [Requirements: Node.js and npm](#12-requirements-nodejs-and-npm)
13. [Installing Truffle](#13-installing-truffle)
14. [Installing and configuring Ganache](#14-installing-and-configuring-ganache)
15. [Project initialization (`truffle init`)](#15-project-initialization-truffle-init)
16. [Installing dependencies](#16-installing-dependencies)
17. [Compiling](#17-compiling)
18. [Testing](#18-testing)
19. [Migrating (deploying) to Ganache](#19-migrating-deploying-to-ganache)
20. [Finding the deployed address](#20-finding-the-deployed-address)
21. [How the frontend gets the ABI and address](#21-how-the-frontend-gets-the-abi-and-address)
22. [Starting the frontend](#22-starting-the-frontend)
23. [Using and testing the dApp](#23-using-and-testing-the-dapp)
24. [Expected results](#24-expected-results)
25. [Troubleshooting](#25-troubleshooting)
26. [Screenshots](#26-screenshots)
27. [Uploading to GitHub](#27-uploading-to-github)
28. [Known limitations](#28-known-limitations)
29. [Future improvements](#29-future-improvements)
30. [Academic disclaimer](#30-academic-disclaimer)

---

## 1. Project overview
In Assignment 2, CampusSkill was deployed to the Sepolia testnet with Remix and used through MetaMask. Assignment 3 moves the **same contract** into a professional local workflow:

- **Truffle** manages the project: `truffle compile` builds it, `truffle test` runs automated tests, and `truffle migrate` deploys it through a migration script.
- **Ganache** provides a private Ethereum blockchain on your own computer, with 10 funded test accounts and instant mining.
- The **frontend** (HTML/CSS/JavaScript + ethers.js) talks to the contract deployed on Ganache, using the ABI and address taken from Truffle's build output.

## 2. Problem statement
Remix is good for experiments, but it is hard to repeat a deployment, test it automatically, or keep the frontend in sync with what was actually deployed. Every redeploy means copying an address and ABI by hand, and testing on a public testnet needs faucet ETH and waiting for blocks.

## 3. Proposed solution
- Keep the Assignment 2 contract **unchanged** (`contracts/SmartContract.sol`, contract `CampusSkill`).
- Deploy it with a **Truffle migration** (`migrations/1_deploy_contract.js`) to **Ganache**.
- Test it with **15 automated Truffle tests** (`test/smartcontract.test.js`).
- Generate the frontend config **automatically** from the Truffle artifact (`scripts/sync-frontend.js` → `src/contract-config.js`), so the ABI and address can never drift.
- Let the frontend send transactions from **any Ganache account**, so access control can be demonstrated by switching accounts.

## 4. Objectives
1. Install and configure Truffle and Ganache.
2. Initialize a Truffle project structure.
3. Reuse the Assignment 2 Solidity contract.
4. Write a migration script and connect Truffle to Ganache through `truffle-config.js`.
5. Compile, test and migrate the contract locally.
6. Build a frontend that interacts with the locally deployed contract.
7. Document every step with commands and genuine screenshots.

## 5. Main features
- Same contract as Assignment 2: create, complete, read one milestone, count milestones.
- One-command local chain: `npm run ganache` (Ganache CLI preset to the Ganache GUI defaults: port 7545, network 5777).
- Migration that prints the deployer, contract address and initial count.
- `npm run migrate` = `truffle migrate` **plus** automatic frontend sync (and `npm run migrate:reset` for a fresh redeploy).
- 15 Truffle tests covering deployment, creation, reading, IDs, creator, completion, timestamps, access control, invalid IDs, repeated completion and input validation.
- **Frontend:**
  - Ganache connection status, chain ID and an **account switcher** listing all 10 Ganache accounts
  - per-account progress ring and balance
  - total / completed / pending stats from on-chain data
  - create form with byte counters and validation matching the contract
  - milestone timeline with All / Mine / Pending / Completed filters and sorting
  - a "Mark as completed" button, shown only to the creator
  - transaction status (sent → hash → mined) with hash, block and gas used
  - a **contract event log** (`MilestoneCreated` / `MilestoneCompleted`)
  - a **deployment details** panel (address, deployment tx, compiler, RPC, IDs, latest block)
  - auto-refresh when new blocks are mined elsewhere (e.g. from `truffle console`)
  - clear errors for: Ganache not running, contract not deployed, Ganache restarted, wrong network, contract reverts
  - responsive layout for desktop and mobile
- **Bonus:** multi-account interaction (switch Ganache accounts to show the creator-only rule), the live event log, and automatic ABI/address sync from Truffle artifacts.

## 6. Technology stack and versions
| Component | Tool | Version |
|---|---|---|
| Smart contract | Solidity | `^0.8.20`, compiled with **solc 0.8.20**, EVM target **paris** |
| Framework | Truffle | **5.11.5** (local devDependency) |
| Local blockchain | Ganache | **7.9.2** CLI (local devDependency); Ganache GUI 2.7.x also works |
| Runtime | Node.js / npm | Node **18, 20 or 22** (tested on 22), npm 9+ |
| Frontend | HTML5, CSS3, vanilla JavaScript | — |
| Blockchain library | ethers.js | **6.13.4** (pinned CDN, UMD build) |
| Static server | http-server | 14.1.1 (local devDependency) |
| Editor / VCS | VS Code, Git, GitHub | — |

**Compatibility decisions**
- **Truffle and Ganache were archived by ConsenSys in 2023.** They still install from npm and work. They're installed **locally** (pinned in `package.json` + `package-lock.json`), so everyone gets the same versions and no global install is needed. Use them through `npx truffle …` or the npm scripts.
- **`evmVersion: "paris"`**: Solidity 0.8.20 defaults to the *shanghai* EVM (`PUSH0` opcode). Ganache GUI 2.7.x doesn't support that, so the contract is compiled for *paris*. It then deploys on both Ganache CLI 7.9 and Ganache GUI.
- **ethers.js v6** instead of web3.js: the assignment allows either. ethers is the same library used in Assignment 2, so the code and error handling carry over. (Truffle itself still uses web3.js internally for migrations and tests.)
- **No MetaMask is needed.** Ganache's accounts are unlocked, so the page sends transactions straight through Ganache's RPC from the account you choose. No private keys are stored anywhere.

## 7. System architecture
```
 contracts/SmartContract.sol ──truffle compile──► build/contracts/CampusSkill.json (ABI + bytecode)
                                                          │
 migrations/1_deploy_contract.js ──truffle migrate──► Ganache (127.0.0.1:7545)
                                                          │   records networks[5777].address
                                                          ▼
                     scripts/sync-frontend.js ──► src/contract-config.js (ABI + address + RPC)
                                                          │
 Browser: src/index.html + style.css + script.js ── ethers.JsonRpcProvider ──► Ganache RPC
          reads:  getMilestoneCount(), getMilestone(id), events
          writes: createMilestone(), completeMilestone()  (eth_sendTransaction from a Ganache account)
```

## 8. Folder structure
```
CampusSkill-Assignment3/
├── contracts/
│   └── SmartContract.sol          # Assignment 2 contract, unchanged (contract CampusSkill)
├── migrations/
│   └── 1_deploy_contract.js       # Truffle migration that deploys CampusSkill
├── src/                           # Frontend
│   ├── index.html                 # Dashboard page
│   ├── script.js                  # ethers.js logic: connect, read, write, render
│   ├── style.css                  # Styling and responsive layout
│   ├── contract-config.js         # GENERATED by scripts/sync-frontend.js (ABI + address)
│   └── assets/campus-learning.svg # Original illustration
├── test/
│   └── smartcontract.test.js      # 15 Truffle (Mocha/Chai) tests
├── scripts/
│   └── sync-frontend.js           # Copies ABI + deployed address from build/ to src/
├── screenshots/
│   ├── README.txt                 # What to capture
│   └── *.png                      # Your genuine screenshots
├── build/                         # GENERATED by truffle compile/migrate (not committed)
├── truffle-config.js              # Ganache connection + compiler settings
├── package.json                   # Pinned Truffle/Ganache/http-server + npm scripts
├── package-lock.json              # Exact dependency tree
├── .gitignore
└── README.md
```
**Optional extras:** `test/`, `scripts/`, `package.json` and `package-lock.json` aren't in the minimum assignment structure, but they make the project reproducible and testable. `build/` is regenerated by Truffle on any machine, so it isn't committed. It contains absolute paths from the computer that built it.

## 9. Smart contract
`contracts/SmartContract.sol` is **byte-for-byte the Assignment 2 contract** (contract name `CampusSkill`). Nothing was renamed or changed.

```solidity
struct Milestone {
    uint256 id;          // sequential, starts at 1
    string  title;       // 1–80 bytes
    string  description; // 1–280 bytes
    address creator;     // msg.sender
    uint256 createdAt;   // block.timestamp at creation
    bool    completed;
    uint256 completedAt; // block.timestamp at completion (0 while pending)
}
mapping(uint256 => Milestone) private milestones;
uint256 private milestoneCount;
```
Storage and limits are `private` / `internal`, so the ABI has exactly four functions.

## 10. Contract functions
| Function | Type | What it does |
|---|---|---|
| `createMilestone(string title, string description) returns (uint256)` | write | Validates both inputs, assigns the next ID, stores the milestone with `creator = msg.sender` and `createdAt = block.timestamp`, and emits `MilestoneCreated`. |
| `completeMilestone(uint256 milestoneId)` | write | Requires a valid ID, the caller to be the creator, and the milestone to be pending. Sets `completed` and `completedAt`, then emits `MilestoneCompleted`. |
| `getMilestone(uint256 milestoneId) view returns (Milestone)` | read | Returns the full struct, or reverts with `MilestoneNotFound`. |
| `getMilestoneCount() view returns (uint256)` | read | Number of milestones, which is also the highest valid ID. |

**Custom errors:** `EmptyTitle`, `TitleTooLong(length, max)`, `EmptyDescription`, `DescriptionTooLong(length, max)`, `MilestoneNotFound(id)`, `NotMilestoneCreator(id, caller)`, `MilestoneAlreadyCompleted(id)`. The frontend and the tests decode them into readable messages.

## 11. Events and access control
```solidity
event MilestoneCreated(uint256 indexed id, address indexed creator, string title, uint256 createdAt);
event MilestoneCompleted(uint256 indexed id, address indexed creator, uint256 completedAt);
```
- Anyone can create; the creator is `msg.sender`.
- Only the creator can complete, and only once.
- There's no admin role, and nothing can be edited or deleted.
- The frontend's **account switcher** demonstrates this. Create with Account 0, switch to Account 1, and the complete button disappears. The test `prevents another wallet from completing it` proves the contract enforces it.

## 12. Requirements: Node.js and npm
Install **Node.js 20 LTS** (or 18/22) from <https://nodejs.org/en/download>. npm comes with it. Then check the versions:
```bash
node -v     # v18.x, v20.x or v22.x
npm -v      # 9.x or newer
```
> **Windows:** run the commands in **Command Prompt (cmd)**. PowerShell often blocks `npx` with a "running scripts is disabled" error. To open cmd in the project folder, click the File Explorer address bar, type `cmd` and press Enter.

## 13. Installing Truffle
Truffle is already listed in `package.json`, so `npm install` installs it **locally**. Then use it with `npx`:
```bash
npx truffle version
```
Expected: `Truffle v5.11.5 … Ganache v7.9.1 … Solidity - 0.8.20 (solc-js) … Web3.js v1.10.0`.

*(Optional global install: `npm install -g truffle@5.11.5`, after which you can type `truffle …` without `npx`.)*

## 14. Installing and configuring Ganache
**Option A: Ganache CLI (recommended, already installed by `npm install`)**
```bash
npm run ganache
```
This starts Ganache on **127.0.0.1:7545** with **chain ID 1337** and **network ID 5777** (the same defaults as Ganache GUI). It creates 10 deterministic accounts with 100 ETH each and saves the chain in `.ganache-db/`, so your deployment survives a restart. Leave this window open. You should see `RPC Listening on 127.0.0.1:7545`.

**Option B: Ganache GUI**
1. Download the installer from <https://archive.trufflesuite.com/ganache/> (or the GitHub releases of `trufflesuite/ganache-ui`, v2.7.1).
2. Open it and click **Quickstart (Ethereum)**.
3. At the top, check **RPC SERVER** (default `HTTP://127.0.0.1:7545`) and **NETWORK ID** (default `5777`).

**Matching Truffle to Ganache:** `truffle-config.js` uses host `127.0.0.1`, port `7545` and `network_id: "*"`, which accepts any network ID. If your Ganache shows a different port, edit `GANACHE_PORT` in `truffle-config.js`, or set it for one command:
```bash
set GANACHE_PORT=8545          # Windows cmd
export GANACHE_PORT=8545       # macOS / Linux
```

## 15. Project initialization (`truffle init`)
This project was built on the standard scaffold that `truffle init` creates (`contracts/`, `migrations/`, `test/`, `truffle-config.js`). The scaffold files were then filled in with the Assignment 2 contract, the migration, the tests and the Ganache configuration. To reproduce the init step (and take its screenshot) without touching this project:
```bash
mkdir init-demo
cd init-demo
npx truffle init          # -> "Init successful, sweet!"
cd ..
rmdir /s /q init-demo     # Windows cmd   (macOS/Linux: rm -rf init-demo)
```

## 16. Installing dependencies
From the project folder:
```bash
npm install
```
This installs Truffle 5.11.5, Ganache 7.9.2 and http-server into `node_modules/`, which is about 5 minutes the first time. Deprecation warnings are normal because Truffle and Ganache are archived.

## 17. Compiling
```bash
npx truffle compile
```
Truffle downloads solc 0.8.20 the first time (internet needed) and writes `build/contracts/CampusSkill.json`.

## 18. Testing
With Ganache running:
```bash
npx truffle test          # or: npm test
```
Each test deploys a fresh contract with `CampusSkill.new()`, so the tests don't depend on each other or on your demo data. Expected: **15 passing**.

| Group | Tests |
|---|---|
| deployment | has an address and bytecode · the migrated instance exists · ABI has exactly the 4 functions · count starts at 0 |
| create / read | stores every field, `createdAt` = block time, emits event · sequential unique IDs and per-milestone creator · `EmptyTitle` · `EmptyDescription` · `TitleTooLong` (81 rejected, 80 accepted) · `DescriptionTooLong` (281 rejected, 280 accepted) · failed calls don't change the count |
| complete | creator completes, `completedAt` = block time, emits event · other account rejected with `NotMilestoneCreator` · second completion rejected with `MilestoneAlreadyCompleted` |
| invalid IDs | 0 and count+1 rejected for both read and write with `MilestoneNotFound` |

## 19. Migrating (deploying) to Ganache
```bash
npx truffle migrate --network development
npm run sync                     # copy the new ABI + address into src/contract-config.js
```
or both in one step:
```bash
npm run migrate
```
**Redeploying and `--reset`:** `--reset` tells Truffle to run *all* migration scripts from the beginning, ignoring any record of earlier runs. Older Truffle projects kept that record in a `Migrations.sol` contract, where `--reset` was the only way to redeploy. Truffle 5.11 no longer needs `Migrations.sol`, and this project doesn't use one, so Truffle keeps no record: **every** `truffle migrate` deploys a **new** CampusSkill instance at a new address, with an empty milestone list. `--reset` is still the explicit, conventional command when you *mean* to redeploy (after changing the contract, or when Ganache was started with an empty chain):
```bash
npx truffle migrate --network development --reset
npm run sync
# or: npm run migrate:reset
```
**After any migrate, run `npm run sync`** (the `npm run migrate…` scripts do it for you) so the frontend points at the newest address. Your old milestones stay on the old instance. To keep demo data, migrate once and then only use the frontend.

## 20. Finding the deployed address
You can find it in any of these places:
- the `truffle migrate` output: `> contract address: 0x…` and the `CampusSkill deployed` box
- `build/contracts/CampusSkill.json` → `"networks"` → `"5777"` → `"address"`
- `src/contract-config.js` → `"address"` (after `npm run sync`)
- the frontend's **Deployment details** panel
- Ganache GUI → **Contracts** / **Transactions** tab

## 21. How the frontend gets the ABI and address
1. `truffle compile` writes the ABI into `build/contracts/CampusSkill.json`.
2. `truffle migrate` adds `networks[<network id>].address` and the deployment transaction hash to that file.
3. `scripts/sync-frontend.js` asks the running Ganache for its network ID, takes the matching entry and **checks that bytecode exists at that address**. It then writes `src/contract-config.js` with the ABI, address, deployment tx, compiler version, RPC URL, chain ID and network ID.
4. `src/index.html` loads `contract-config.js` before `script.js`, so the page always uses the ABI and address that Truffle produced. Nothing is copied by hand.

The repository ships a **placeholder** `contract-config.js` (`window.CAMPUSSKILL_CONFIG = null`), and the page says "Contract not deployed yet" until you migrate and sync. No address is invented.

## 22. Starting the frontend
In a separate cmd window:
```bash
npm run frontend
```
Open **http://127.0.0.1:8080**. Opening `src/index.html` by double-clicking also works, because the page uses classic scripts and talks to Ganache over HTTP. An internet connection is needed once to load ethers.js and the font from the CDN.

## 23. Using and testing the dApp
1. Check the header: **Network: Ganache · chain 1337** (green) and **Account: Account 0 · 0x90F8…c9C1**.
2. **Create:** enter a title and description, then click **Publish milestone**. Transaction status shows *Sent → hash received → mined in block N*, the card appears as **#1 · Pending · Selected account**, and the event log shows `MilestoneCreated`.
3. **Access control:** switch the account dropdown to **Account 1**. The card now says *"Only Account 0 … can complete this"* and has no button.
4. **Complete:** switch back to **Account 0** and click **Mark as completed**. The card turns green with a completion date, the event log shows `MilestoneCompleted`, and the ring reaches 100%.
5. **Persistence:** reload the page. The data is read back from Ganache.
6. **Errors:** stop Ganache (Ctrl+C in its window). Within a few seconds the page shows *"Lost connection to Ganache"*. Start it again and click **Reconnect**.

## 24. Expected results
| Command / action | Expected output |
|---|---|
| `npx truffle compile` | `Compiled successfully using: solc: 0.8.20+commit.a1b79de6` |
| `npm run ganache` | `RPC Listening on 127.0.0.1:7545` and 10 accounts |
| `npx truffle migrate --network development` | `Deploying 'CampusSkill'`, transaction hash, contract address, `Total deployments: 1` |
| `npm run sync` | `Frontend synced with the Truffle deployment … Written to src/contract-config.js` |
| `npx truffle test` | `15 passing` |
| Frontend | Green Ganache status; create and complete work; events listed |

## 25. Troubleshooting
| Problem | Fix |
|---|---|
| `'npx' is not recognized` / `'node' is not recognized` | Install Node.js 20 LTS, then open a **new** cmd window. |
| PowerShell: *running scripts is disabled* | Use **Command Prompt (cmd)** instead of PowerShell. |
| `Could not connect to your Ethereum client` | Ganache isn't running, or it's on another port. Start `npm run ganache` or check the port in Ganache GUI. |
| `Failed to fetch the Solidity compiler` | You need internet the first time Truffle downloads solc 0.8.20. |
| Migration fails with `invalid opcode` | Make sure `evmVersion: "paris"` is still in `truffle-config.js`. |
| Page: **Contract not deployed yet** | Run `npm run migrate` (or `npx truffle migrate --network development` then `npm run sync`), then reload. |
| Page: **Contract not found on Ganache** / **Different Ganache network** | Ganache was started with a fresh chain. Run `npm run migrate:reset`, then reload. |
| Page: **Cannot reach Ganache** | Start Ganache, then click **Reconnect**. |
| `EADDRINUSE` when starting Ganache or the frontend | Another copy is already running. Close it, or use the one that's running. |
| Ganache GUI: migrate works but the page shows nothing | Check the GUI's RPC port is 7545 (it must match `truffle-config.js`), then `npm run migrate:reset`. |
| Start again from a clean chain | Stop Ganache, delete the `.ganache-db` folder, run `npm run ganache`, then `npm run migrate:reset`. |

## 26. Screenshots
Genuine screenshots from my own laptop (Windows, Node 22.23.5), in the order the steps were done:

| # | File | Shows |
|---|---|---|
| 1 | `screenshots/01-node-version.png` | `node -v` → **v22.23.5** (Node.js installed) |
| 2 | `screenshots/02-npm-install.png` | `npm install` → added 1531 packages (Truffle, Ganache, http-server) |
| 3 | `screenshots/03-ganache-running.png` | `npm run ganache` → Ganache running, chain ID 1337, **RPC Listening on 127.0.0.1:7545** |
| 4 | `screenshots/04-truffle-compile.png` | `npx truffle compile` → solc 0.8.20 downloaded, **Compiled successfully**, artifacts in `build/contracts` |
| 5 | `screenshots/05-truffle-migrate.png` | `npx truffle migrate --network development` (left) next to Ganache (right): **CampusSkill deployed at 0xe78A0F7E…a8Ab**, block 1, **Total deployments: 1**; Ganache shows *Contract created* with the same address |
| 6 | `screenshots/06-truffle-sync-frontend.png` | `npm run sync` → ABI + address copied from the Truffle artifact to `src/contract-config.js` |
| 7 | `screenshots/07-truffle-test.png` | `npx truffle test` → **15 passing** |
| 8 | `screenshots/08-frontend-server.png` | `npm run frontend` → serving `src/` on http://127.0.0.1:8080 |
| 9 | `screenshots/09-frontend-connected.png` | Dashboard connected: **Ganache · chain 1337**, Account 0, 0 milestones on the fresh contract |
| 10 | `screenshots/10-frontend-milestone-created.png` | Milestone #1 created, **mined in block 2**, tx hash, `MilestoneCreated` event, deployment details |
| 11 | `screenshots/11-frontend-milestone-completed.png` | Milestone #1 **Completed**, **mined in block 3**, `MilestoneCompleted` event |
| 12 | `screenshots/12-project-folder-after-build.png` | Project folder after running: `build/` (Truffle artifacts) and `.ganache-db/` generated |

## 27. Uploading to GitHub
1. On GitHub: **+ → New repository**, name it `mg3012-campusSkill-assignment3`, choose **Public**, leave "Add README" **unticked**, then **Create repository**.
2. Click **uploading an existing file**.
3. In the project folder, select **everything except `node_modules`, `build` and `.ganache-db`**, and drag it in.
4. Click **Commit changes**.
5. Paste the repository URL into the table at the top of this README (you can edit it on GitHub with the ✏️ button).

With Git instead:
```bash
git init
git add .
git commit -m "CampusSkill Assignment 3: Truffle + Ganache"
git branch -M main
git remote add origin https://github.com/<your-username>/mg3012-campusSkill-assignment3.git
git push -u origin main
```
`.gitignore` already excludes `node_modules/`, `build/`, `.ganache-db/` and secrets.

**Submission ZIP:** select the same items (everything except `node_modules`, `build` and `.ganache-db`), right-click → **Compress to ZIP file**, and name it `CampusSkill-Assignment3-Submission.zip`.

## 28. Known limitations
- Truffle and Ganache are **archived** tools. They work, but they print deprecation warnings and get no updates.
- Everything is **local**: the Ganache chain exists only on your computer, so other people can't open your deployment.
- If Ganache is started without its database (or the `.ganache-db` folder is deleted), the old deployment is gone, and you need to redeploy with `--reset`.
- The frontend uses Ganache's **unlocked accounts**. That's fine for local development, but a real app would sign with a wallet such as MetaMask.
- ethers.js and the font load from CDNs, so the first load needs internet.
- Reading one `getMilestone` call per milestone is fine for coursework, but a large registry would need pagination or an indexer.

## 29. Future improvements
- Optional MetaMask mode (add network `http://127.0.0.1:7545`, chain ID 1337) to sign with an imported Ganache account.
- A second contract (e.g. instructor attestations), deployed by `2_deploy_attestations.js`.
- Gas reports and coverage (`solidity-coverage`).
- Migrate the project to Hardhat or Foundry, the actively maintained successors to Truffle.

## 30. Academic disclaimer
Academic project for MG3012 at FAST-NUCES. Milestones are self-reported and are **not** accredited certificates. Ganache is a private test chain, and its ETH has no value.
