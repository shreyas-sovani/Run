// Sets deployBlock in the deployment JSON from the broadcast receipt of the RunBank CREATE. Prints no secrets.
const fs = require("fs");
const b = JSON.parse(fs.readFileSync("broadcast/Deploy.s.sol/10143/run-latest.json", "utf8"));
const create = b.transactions.find((t) => t.transactionType === "CREATE");
const rc = b.receipts.find((r) => r.transactionHash === create.hash);
const out = "../app/src/config/deployment.testnet.json";
const j = JSON.parse(fs.readFileSync(out, "utf8"));
j.deployBlock = String(parseInt(rc.blockNumber, 16));
fs.writeFileSync(out, JSON.stringify(j, null, 2) + "\n");
console.log("deployBlock", j.deployBlock, "gasUsed", parseInt(rc.gasUsed, 16), "tx", create.hash);
for (const t of b.transactions) {
  const r = b.receipts.find((x) => x.transactionHash === t.hash);
  console.log(t.transactionType, t.hash, "gasUsed", parseInt(r.gasUsed, 16));
}
