const cron = require('cron');
//const moment = require('moment');
const config = require('../modules/configReader')
const payOut=require('../modules/payOut');
const cronPattern=config.bet_period_cron_pattern;
const timezone=config.timezone;
const log = require('./log');
const $u = require('./utils');

module.exports = {
    betsJob: null,
    ifCoolPeriod(dateTx){
        const remainHours = (this.betsJob.nextDates() - dateTx) / 1000 / 60 / 60;
        console.log('ifCoolPeriod- Remain hours: ' + remainHours + '; Cool hours: ' + config.cool_period_hours);
        return remainHours < config.cool_period_hours;
    },
    setJob(){
        this.betsJob = cron.job(cronPattern, () => {
            log.info('Cron started: ' + Date.now().toString());
            payOut();
        }, null, true, timezone);
        this.betsJob.start();
        log.info('Cron started with patter: ' + cronPattern);
        console.log('Current time:       ' + Date.now());
        console.log('Cron next time run: ' + this.betsJob.nextDates());
        console.log('Cron previous time run: ' + this.betsJob.lastDate());
        console.log('Time till next run: ' + $u.timeDiffDaysHoursMins(this.betsJob.nextDates(), Date.now()));
    },
}

module.exports.setJob();

// console.log('Cron next time run: ' + module.exports.betsJob.nextDates());
//console.log(job.nextDates(5).map(date => date.toString()));
//console.log('Cron next time run: ' + job.nextDates(1).unix());
//console.log('Cron next time run: ' + job.nextDates.unix());
//console.log('Cron next time run: ' + moment(job.nextDates(1)).unix());
//console.log('Cron next time run: ' + job.nextDates(1).unix());
//console.log('Minutes till next run: ' + (job.nextDates() - Date.now()) /1000 / 60);
//console.log('Minutes till next run: ' + $u.timeDiff(job.nextDates(), Date.now(), 'minutes'));

//var CurrentDate = moment().unix();
//console.log(CurrentDate);