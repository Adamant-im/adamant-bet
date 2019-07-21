const notify = require('./helpers/notify');
const db = require('./modules/DB');
const Store = require('./modules/Store');
const checker = require('./modules/checkerTransactions');

setTimeout(init, 4000);

function init() {
	require('./server');
	require('./modules/confirmationsCounter');
	require('./modules/updateRounds');
	require('./modules/sendBack');
	require('./modules/sendBackTxValidator');
	require('./helpers/CronTask');
	try {
		console.log('App started.');

		// db.systemDb.db.drop();
		// db.incomingTxsDb.db.drop();
		// db.paymentsDb.db.drop();
		// db.roundsDb.db.drop();
		// db.rewardsPayoutsDb.db.drop();
		// console.log('Databases has been cleared.');

		db.systemDb.findOne().then(system => {
			if (system) {
				Store.lastBlock = system.lastBlock;
				if(system.round){
					Store.round = system.round;
				} else {
					Store.nextRound();
				}
			} else { // if fst start
				Store.updateLastBlock();
				Store.nextRound();
			}

			checker();
		});
	} catch (e) {
		notify('Bet Bot is not started. Error: ' + e, 'error');
		process.exit();
	}
}
