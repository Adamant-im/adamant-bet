const log = require('../helpers/log');
const MongoClient = require('mongodb').MongoClient;
const mongoClient = new MongoClient('mongodb://127.0.0.1:27017/', {useNewUrlParser: true, useUnifiedTopology: true, serverSelectionTimeoutMS: 3000});
const model = require('../helpers/dbModel');
const collections = {};

mongoClient.connect((error, client) => {
  if (error) {
    log.error(`Unable to connect to MongoDB, ` + error);
    process.exit(-1);
  }
  const db = client.db('betsdb');
  collections.db = db;
  collections.SystemDb = model(db.collection('systems'));
  collections.IncomingTxsDb = model(db.collection('incomingtxs'));
  collections.PaymentsDb = model(db.collection('payments'));
  collections.RewardsPayoutsDb = model(db.collection('rewardspayouts'));
  collections.RoundsDb = model(db.collection('rounds'));

  log.log(`Successfully connected to 'betsdb' MongoDB.`);
});

module.exports = collections;
