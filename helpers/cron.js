const cron = require('cron');
const config = require('./configReader')
const payOut=require('./payOut');
const cronPattern=config.bet_period_cron_pattern;
const log = require('./log');
log.info('Cron started with patter: ' + cronPattern);

let pattern;

// 'min(0-59) hours(0-23) d_mon(1-31) mon(1-12) d_week(0-7)'

switch(payoutperiod){
	
	case('1h'):
	pattern='0 0-23 * * *';
	break;
	 
	case('1d'):
	pattern='0 0 1-31 * *';
	break;
	
	case('5d'):
	pattern='0 0 1,5,10,15,20,25 * *';
	break;
	
	case('10d'):
	pattern='0 0 1,10,20 * *';
	break;
	
	case('15d'):
	pattern='0 0 1,15 * *';
	break;
	
	case('30d'):
	pattern='0 0 1 * *';
	break;
	
}

cron.schedule(pattern, () => {
	payOut();
});