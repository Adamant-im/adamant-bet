const notify = require('./helpers/notify');
const db = require('./modules/DB');
const Store = require('./modules/Store');
const Task = require('./helpers/CronTask');
const checker = require('./modules/checkerTransactions');
setTimeout(init, 2000);

function init() {
	require('./server');
	require('./modules/confirmationsCounter');
	require('./modules/exchangePayer');
	require('./modules/sendBack');
	require('./modules/sendedTxValidator');
	// require('./helpers/cronTask');
	try {
		console.log('App started.');

		// 		db.systemDb.db.drop();
		// db.incomingTxsDb.db.drop();
		// db.paymentsDb.db.drop();

		db.systemDb.findOne().then(system => {
			if (system) {
				Store.lastBlock = system.lastBlock;
				Store.round = system.round;
			} else { // if fst start
				Store.updateLastBlock();
				Store.nextRound();
			}
//			Task.setJob();
		// console.log('111Cron next time run: ' + Task.betsJob.nextDates());
			checker();
			notify(`*Bet Bot ${Store.botName} started* for address _${Store.user.ADM.address}_ (ver. ${Store.version}). Current round: ${Store.round}.`, 'info');
		});
	} catch (e) {
		notify('Bet Bot is not started. Error: ' + e, 'error');
	}
}
