const cron = require('cron');
const config = require('./configReader')
const payOut=require('../modules/payOut');
const cronPattern=config.bet_period_cron_pattern;
const log = require('./log');

log.info('Cron started with patter: ' + cronPattern);

cron.schedule(pattern, () => {
	payOut();
});