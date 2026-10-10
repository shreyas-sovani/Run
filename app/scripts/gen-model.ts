// B-08 helper: rebuild data/model.json (inputs + modelHash) from the data files and the weights already in model.json.
// Run after changing graph / ledger / configs / cards by hand. `pnpm tsx scripts/gen-model.ts`
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildModelFile, loadModel, tuningOf } from '../src/engine/model';

const model = loadModel();
const file = buildModelFile(model, tuningOf(model), model.modelVersion === 'v0-untuned' ? 'v0-untuned' : model.modelVersion);
writeFileSync(fileURLToPath(new URL('../src/engine/data/model.json', import.meta.url)), JSON.stringify(file, null, 1) + '\n');
console.log(`model.json: version ${file.modelVersion} hash ${file.modelHash}`);
