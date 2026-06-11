const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/classic_fitness_park';
const SAMPLE_LIMIT = Number(process.env.MONGO_SCHEMA_SAMPLE_LIMIT || 100);
const OUTPUT_FILE = process.env.MONGO_SCHEMA_OUTPUT ||
  path.join(__dirname, 'mongodb-schema-snapshot.json');

function typeOfValue(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (value && value._bsontype === 'ObjectId') return 'objectId';
  return typeof value;
}

function mergeField(target, value) {
  const type = typeOfValue(value);
  target.types[type] = (target.types[type] || 0) + 1;
  target.seen += 1;

  if (type === 'object' && value) {
    target.children = target.children || {};
    for (const [key, childValue] of Object.entries(value)) {
      target.children[key] = target.children[key] || { seen: 0, types: {} };
      mergeField(target.children[key], childValue);
    }
  }

  if (type === 'array') {
    target.array = target.array || { minLength: Number.MAX_SAFE_INTEGER, maxLength: 0, item: { seen: 0, types: {} } };
    target.array.minLength = Math.min(target.array.minLength, value.length);
    target.array.maxLength = Math.max(target.array.maxLength, value.length);
    for (const item of value) {
      mergeField(target.array.item, item);
    }
  }
}

function finalizeField(field, totalDocs) {
  const output = {
    presence: totalDocs ? Number((field.seen / totalDocs).toFixed(4)) : 0,
    types: field.types,
  };

  if (field.children) {
    output.children = {};
    for (const [key, child] of Object.entries(field.children).sort(([a], [b]) => a.localeCompare(b))) {
      output.children[key] = finalizeField(child, field.seen);
    }
  }

  if (field.array) {
    output.array = {
      minLength: field.array.minLength === Number.MAX_SAFE_INTEGER ? 0 : field.array.minLength,
      maxLength: field.array.maxLength,
      item: finalizeField(field.array.item, Math.max(1, field.array.item.seen)),
    };
  }

  return output;
}

async function duplicateSummary(collection, field) {
  return collection.aggregate([
    { $match: { [field]: { $exists: true, $nin: [null, ''] } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $project: { value: '$_id', count: 1, ids: { $slice: ['$ids', 10] }, _id: 0 } },
    { $limit: 25 },
  ]).toArray();
}

async function inspectCollection(db, collectionInfo) {
  const collection = db.collection(collectionInfo.name);
  const indexes = await collection.indexes();
  const count = await collection.estimatedDocumentCount();
  const samples = await collection.find({}).limit(SAMPLE_LIMIT).toArray();
  const fields = {};

  for (const doc of samples) {
    for (const [key, value] of Object.entries(doc)) {
      fields[key] = fields[key] || { seen: 0, types: {} };
      mergeField(fields[key], value);
    }
  }

  const finalizedFields = {};
  for (const [key, field] of Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))) {
    finalizedFields[key] = finalizeField(field, samples.length);
  }

  const output = {
    name: collectionInfo.name,
    type: collectionInfo.type,
    documentCount: count,
    sampledDocuments: samples.length,
    indexes,
    fields: finalizedFields,
  };

  if (collectionInfo.name === 'users') {
    output.duplicateChecks = {
      phone: await duplicateSummary(collection, 'phone'),
      email: await duplicateSummary(collection, 'email'),
      qrCodeId: await duplicateSummary(collection, 'qrCodeId'),
      membershipMemberId: await duplicateSummary(collection, 'membership.memberId'),
    };
  }

  return output;
}

async function main() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const output = {
    generatedAt: new Date().toISOString(),
    database: db.databaseName,
    sampleLimit: SAMPLE_LIMIT,
    collections: [],
  };

  for (const collectionInfo of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    output.collections.push(await inspectCollection(db, collectionInfo));
  }

  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`MongoDB schema snapshot written to ${OUTPUT_FILE}`);

  const userCollection = output.collections.find((collection) => collection.name === 'users');
  if (userCollection?.duplicateChecks) {
    const duplicateCounts = Object.fromEntries(
      Object.entries(userCollection.duplicateChecks).map(([key, rows]) => [key, rows.length])
    );
    console.log('Duplicate user checks:', duplicateCounts);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
