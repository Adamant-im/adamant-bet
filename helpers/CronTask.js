const moment = require('moment');
const cron = require('cron');
const config = require('../modules/configReader')
const cronPattern=config.bet_period_cron_pattern;
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
            log.info('Cron job started at ' + moment(Date.now()).format('YYYY/MM/DD HH:mm Z'));
            Store.nextRound();
        }, null, true);
        log.info('Cron started with patter: ' + cronPattern);
        this.betsJob.start();
        
        setTimeout(()=>{ // Wait for Store initialization
            notify(`*Bet Bot ${Store.botName} started* for address _${Store.user.ADM.address}_ (ver. ${Store.version}). Current round _${Store.round}_ ends in _${this.getBetDateString('current').tillString}_ (_${this.getBetDateString('current').nextRoundTime}_).`, 'info');
        }, 5000);
    }
}

module.exports.setJob();

