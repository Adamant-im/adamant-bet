const notify = require('./helpers/notify');
const db = require('./modules/DB');
const Store = require('./modules/Store');
const checker = require('./modules/checkerTransactions');

setTimeout(init, 4000);

function init() {
  require('./server');
  require('./modules/confirmationsCounter');
  require('./modules/sendBack');
  require('./modules/sendBackTxValidator');

  require('./modules/rewardsPayer');
  require('./modules/calcWinners');
  require('./modules/createPayouts');
  require('./modules/rewardTxValidator');

  const Task = require('./helpers/CronTask');

  try {
    console.log('App started.');

    // db.SystemDb.db.drop();
    // db.IncomingTxsDb.db.drop();
    // db.PaymentsDb.db.drop();
    // db.RoundsDb.db.drop();
    // db.RewardsPayoutsDb.db.drop();
    // console.log('Databases has been cleared.');

    db.SystemDb.findOne().then((system) => {
      if (system) {
        Store.lastBlock = system.lastBlock;
        if (system.round) {
          Store.updateSystem('round', system.round);
        }
      } else { // if fst start
        Store.updateLastBlock();
      }
      Task.checkRounds();
      checker();
    });
  } catch (e) {
    notify('Bet Bot is not started. Error: ' + e, 'error');
    process.exit();
  }
}
