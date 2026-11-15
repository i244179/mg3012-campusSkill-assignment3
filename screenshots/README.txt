CampusSkill - Assignment 3 Screenshots (Truffle + Ganache)
==========================================================

Genuine screenshots captured on my own laptop on 15 Nov 2026,
in the order the steps were performed:

  01-node-version.png                 node -v -> v22.23.5
  02-npm-install.png                  npm install -> added 1531 packages
  03-ganache-running.png              npm run ganache -> RPC Listening on 127.0.0.1:7545 (chain 1337)
  04-truffle-compile.png              npx truffle compile -> Compiled successfully (solc 0.8.20)
  05-truffle-migrate.png              npx truffle migrate --network development + Ganache log
                                      -> CampusSkill deployed at 0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab
  06-truffle-sync-frontend.png        npm run sync -> frontend synced with the Truffle deployment
  07-truffle-test.png                 npx truffle test -> 15 passing
  08-frontend-server.png              npm run frontend -> http://127.0.0.1:8080
  09-frontend-connected.png           dashboard connected to Ganache (chain 1337), Account 0
  10-frontend-milestone-created.png   milestone #1 created, mined in block 2
  11-frontend-milestone-completed.png milestone #1 completed, mined in block 3
  12-project-folder-after-build.png   project folder with generated build/ and .ganache-db/

Note: the private keys / mnemonic visible in 03 are Ganache's standard
public test keys (identical on every machine, no real value).

How to reproduce: see README.md sections 12-24.
