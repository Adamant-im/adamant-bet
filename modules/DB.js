const MongoClient = require('mongodb').MongoClient;
const mongoClient = new MongoClient('mongodb://localhost:27017/', {useNewUrlParser: true, useUnifiedTopology: true});
const model = require('../helpers/dbModel');

const collections = {};

mongoClient.connect((err, client) => {
  if (err) {
    throw (err);
  }
  const db = client.db('betsdb');
  collections.db = db;
  collections.SystemDb = model(db.collection('systems'));
  collections.IncomingTxsDb = model(db.collection('incomingtxs'));
  collections.PaymentsDb = model(db.collection('payments'));
  collections.RewardsPayoutsDb = model(db.collection('rewardspayouts'));
  collections.RoundsDb = model(db.collection('rounds'));
});

module.exports = collections;
