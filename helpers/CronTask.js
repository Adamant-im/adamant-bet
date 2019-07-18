const cron = require('cron');
//const moment = require('moment');
const config = require('../modules/configReader')
const payOut=require('../modules/choosingWinners');
const cronPattern=config.bet_period_cron_pattern;
const timezone=config.timezone;
const log = require('./log');
const $u = require('./utils');
const Store = require('../modules/Store');
const notify = require('./notify');

module.exports = {
    betsJob: null,
    ifCoolPeriod(dateTx){
        const remainHours = (this.betsJob.nextDates() - dateTx) / 1000 / 60 / 60;
        console.log('ifCoolPeriod- Remain hours: ' + remainHours + '; Cool hours: ' + config.cool_period_hours);
        return remainHours < config.cool_period_hours;
    },
    getBetDateString(round) {
        let nextRoundTime, tillString;
        if(round === 'current'){
            nextRoundTime = this.betsJob.nextDates().format('YYYY/MM/DD HH:mm Z');
            tillString = $u.timeDiffDaysHoursMins(this.betsJob.nextDates(), Date.now())
        } else {
            nextRoundTime = this.betsJob.nextDates(2)[1].format('YYYY/MM/DD HH:mm Z');
            tillString = $u.timeDiffDaysHoursMins(this.betsJob.nextDates(2)[1], Date.now())
        }
        return {
            nextRoundTime,
            tillString
        }
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
        
        setTimeout(()=>{ // Wait for Store initialization
            notify(`*Bet Bot ${Store.botName} started* for address _${Store.user.ADM.address}_ (ver. ${Store.version}). Current round _${Store.round}_ ends in _${this.getBetDateString('current').tillString}_.`, 'info');
        }, 5000);

        // console.log('sendAt: ' + this.betsJob.sendAt);
        // console.log('timeout: ' + this.betsJob.timeout);
    }
}

module.exports.setJob();


// setTimeout(()=>{
//     module.exports.setJob();
// }, 2000);
