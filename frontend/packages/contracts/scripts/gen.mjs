// Codegen cho @ecommerce/contracts (SF-2 Task 10):
//   (1) contracts/openapi/*.yaml       -> src/generated/<name>Schema.d.ts   (openapi-typescript)
//   (2) contracts/events/*.schema.json -> src/generated/events/<stem>.ts    (json-schema-to-typescript)
// Specs là READ-ONLY — script này KHÔNG bao giờ ghi vào contracts/.
// Chạy: pnpm --filter @ecommerce/contracts gen
import { compile } from 'json-schema-to-typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(scriptDir, '..');
const contractsRoot = path.resolve(pkgRoot, '../../../contracts');
const openapiDir = path.join(contractsRoot, 'openapi');
const eventsDir = path.join(contractsRoot, 'events');
const outDir = path.join(pkgRoot, 'src', 'generated');
const eventsOutDir = path.join(outDir, 'events');

const eventBanner = (source) =>
  [
    '/* GENERATED — KHÔNG sửa tay.',
    ` * Nguồn: contracts/events/${source}`,
    ' * Regenerate: pnpm --filter @ecommerce/contracts gen */',
  ].join('\n');

async function genOpenapi() {
  fs.mkdirSync(outDir, { recursive: true });
  const specs = fs.readdirSync(openapiDir).filter((f) => f.endsWith('.yaml'));
  for (const spec of specs) {
    const service = spec.replace(/\.yaml$/, '');
    const outPath = path.join(outDir, `${service}Schema.d.ts`);
    const ast = await openapiTS(pathToFileURL(path.join(openapiDir, spec)));
    fs.writeFileSync(outPath, `${astToString(ast)}\n`);
    console.log(`openapi  ${spec.padEnd(18)} -> src/generated/${service}Schema.d.ts`);
  }
}

// "user.created" -> "UserCreated" (title gốc không hợp lệ làm identifier TS)
const pascal = (stem) =>
  stem
    .split(/[.\-_]/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('');

async function genEvents() {
  fs.mkdirSync(eventsOutDir, { recursive: true });
  const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.schema.json'));
  for (const file of files) {
    const stem = file.replace(/\.schema\.json$/, '');
    const schema = JSON.parse(fs.readFileSync(path.join(eventsDir, file), 'utf8'));
    const typeName = pascal(stem);
    schema.title = typeName; // title gốc dạng "user.created" — không hợp lệ làm tên interface TS
    const ts = await compile(schema, typeName, { bannerComment: eventBanner(file) });
    fs.writeFileSync(path.join(eventsOutDir, `${stem}.ts`), ts);
    console.log(`event    ${file.padEnd(28)} -> src/generated/events/${stem}.ts (type ${typeName})`);
  }
}

await genOpenapi();
await genEvents();
console.log(`gen OK — ${fs.readdirSync(outDir).filter((f) => f.endsWith('.d.ts')).length} schemas + ${fs.readdirSync(eventsOutDir).filter((f) => f.endsWith('.ts')).length} events`);
