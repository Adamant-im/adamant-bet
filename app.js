const notify = require('./helpers/notify');
const db = require('./modules/DB');
const Store = require('./modules/Store');
const checker = require('./modules/checkerTransactions');
// const Task = require('./helpers/CronTask');
setTimeout(init, 3000);

function init() {
	require('./server');
	require('./modules/confirmationsCounter');
	require('./modules/exchangePayer');
	require('./modules/sendBack');
	require('./modules/sendBackTxValidator');
	require('./helpers/CronTask');
	try {
		console.log('App started.');

		// setTimeout(()=>{
		// 	db.systemDb.db.drop();
		// 	db.incomingTxsDb.db.drop();
		// 	db.paymentsDb.db.drop();
		// }, 2000);
		
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
//			Task.setJob();
		// console.log('111Cron next time run: ' + Task.betsJob.nextDates());
			checker();
		});
	} catch (e) {
		notify('Bet Bot is not started. Error: ' + e, 'error');
	}
}
