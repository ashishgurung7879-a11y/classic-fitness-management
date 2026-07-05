import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');
const backendRoot = resolve(frontendRoot, '..', 'Backend');

function readFrontend(relativePath) {
  return readFileSync(resolve(frontendRoot, relativePath), 'utf8');
}

function readBackend(relativePath) {
  return readFileSync(resolve(backendRoot, relativePath), 'utf8');
}

function assertContains(source, token, label) {
  assert.ok(source.includes(token), `Expected ${label} to include ${token}`);
}

const main = readFrontend('src/main.jsx');
assert.match(main, /import\s+ScrollReveal\s+from\s+['"]\.\/components\/ScrollReveal['"]/);
assert.match(main, /<ScrollReveal\s*\/>/);

const reveal = readFrontend('src/components/ScrollReveal.jsx');
[
  '.trainer-card',
  '.product-card',
  '.product-card-3d',
  '.testimonial-card',
  'IntersectionObserver',
  'MutationObserver',
].forEach((token) => assertContains(reveal, token, 'ScrollReveal.jsx'));

const trainers = readFrontend('src/sections/TrainersSection.jsx');
[
  "trainerProfile?.applicationStatus === 'approved'",
  'trainer?.isActive !== false',
  'className="trainer-card visible"',
  "console.debug('[TrainersSection] requesting approved trainers')",
].forEach((token) => assertContains(trainers, token, 'TrainersSection.jsx'));

const shop = readFrontend('src/sections/ShopSection.jsx');
[
  'product?.isActive !== false',
  'className="product-card visible"',
  "console.debug('[ShopSection] requesting public products')",
].forEach((token) => assertContains(shop, token, 'ShopSection.jsx'));

const trainersRoute = readBackend('routes/trainers.js');
const productsRoute = readBackend('routes/products.js');
const middleware = readBackend('middleware/index.js');

[
  'User.collection.find',
  "trainerProfile.applicationStatus': 'approved'",
  '{ isActive: true }',
  "{ isActive: { $exists: false } }",
].forEach((token) => assertContains(trainersRoute, token, 'routes/trainers.js'));

[
  'Product.find(q)',
  '$or: [',
  '{ isActive: true }',
  '{ isActive: { $exists: false } }',
].forEach((token) => assertContains(productsRoute, token, 'routes/products.js'));

[
  'Cache-Control',
  'no-store, no-cache, must-revalidate, proxy-revalidate',
  'sendFile(frontendIndexPath)',
].forEach((token) => assertContains(middleware, token, 'middleware/index.js'));

console.log('Homepage regression checks passed.');
