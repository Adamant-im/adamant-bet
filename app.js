const notify = require('./helpers/notify');
const doClearDB = process.argv.includes('clear_db');
const config = require('./modules/configReader');
const db = require('./modules/DB');
const Store = require('./modules/Store');
const txParser = require('./modules/incomingTxsParser');
const checker = require('./modules/checkerTransactions');

// Socket connection
const api = require('./modules/api');
api.socket.initSocket({socket: config.socket, wsType: config.ws_type, onNewMessage: txParser, admAddress: config.address});

setTimeout(init, 4000);

function init() {
  require('./server');

  try {
    if (doClearDB) {
      console.log('Clearing database…');
      db.SystemDb.db.drop();
      db.IncomingTxsDb.db.drop();
      db.PaymentsDb.db.drop();
      db.RoundsDb.db.drop();
      db.RewardsPayoutsDb.db.drop();
      notify(`*${config.notifyName}: database cleared*. Manually stop the Bot now.`, 'info');
    } else {
      require('./modules/confirmationsCounter');
      require('./modules/sendBack');
      require('./modules/sendBackTxValidator');
      require('./modules/rewardsPayer');
      require('./modules/calcWinners');
      require('./modules/createPayouts');
      require('./modules/rewardTxValidator');

      const Task = require('./helpers/CronTask');

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
    }
  } catch (e) {
    let message = `${config.notifyName} is not started. Error: ${e}`;
    if (e.message.includes('findOne')) {
      message = `${config.notifyName} is not started. Unable to connect to MongoDB. Check if Mongo server is running and available.`;
    }
    notify(message, 'error');
    setTimeout(() => {
      process.exit(1);
    }, 2000);
  }
}
