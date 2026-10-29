// Use the lab administrator for writes; the connector account stays read-only.
db.getSiblingDB('admin').auth(
  process.env.MONGO_INITDB_ROOT_USERNAME,
  process.env.MONGO_INITDB_ROOT_PASSWORD
);
const catalog = db.getSiblingDB('outdoor');
const result = catalog.products.updateOne(
  { _id: 'p001' },
  { $set: { price: 89.99 } }
);
if (result.matchedCount !== 1) throw new Error('Product p001 was not found.');
printjson(catalog.products.findOne({ _id: 'p001' }));
