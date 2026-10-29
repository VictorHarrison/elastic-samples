// Authenticate using the connector's read-only account, then verify the catalog.
db.getSiblingDB('admin').auth('elastic_sync', process.env.MONGO_SYNC_PASSWORD);
const catalog = db.getSiblingDB('outdoor');
const count = catalog.products.countDocuments();
print('Products: ' + count + ' (expected 20)');
if (count !== 20) quit(1);
printjson(catalog.products.findOne({ _id: 'p001' }));
