// Runs automatically only when MongoDB initializes an empty data volume.
const fs = require('fs');
const password = process.env.MONGO_SYNC_PASSWORD;
const adminPassword = process.env.MONGO_INITDB_ROOT_PASSWORD;
if (![password, adminPassword].every(value => /^[a-f0-9]{48}$/.test(value || ''))) {
  throw new Error('Both passwords must be 48 hexadecimal characters. See the README.');
}
if (password === adminPassword) {
  throw new Error('Use different administrator and connector passwords.');
}

const products = JSON.parse(fs.readFileSync('/lab/data/products.json', 'utf8'));
if (products.length !== 20 || new Set(products.map(p => p._id)).size !== 20) {
  throw new Error('Expected 20 products with unique identifiers.');
}

db.getSiblingDB('admin').createUser({
  user: 'elastic_sync',
  pwd: password,
  roles: [{ role: 'read', db: 'outdoor' }]
});

const catalog = db.getSiblingDB('outdoor');
catalog.products.insertMany(products);
print('Outdoor catalog loaded: ' + catalog.products.countDocuments() + ' products.');
