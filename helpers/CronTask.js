const moment = require('moment');
const cron = require('cron');
const db = require('../modules/DB');
const config = require('../modules/configReader')
const log = require('./log');
const $u = require('./utils');
const Store = require('../modules/Store');
const notify = require('./notify');
const calcRounds = require('../modules/calcRounds');

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
    getRoundTime() {
        return this.betsJob.nextDates(2)[1]-this.betsJob.nextDates();
    },
    getTimeLeft(since) {
        return this.betsJob.nextDates()-since;
    },
    setJob(){
        const cronPattern = config.bet_period_cron_pattern;
        this.betsJob = cron.job(cronPattern, () => {
            log.info('Cron job started at ' + moment(Date.now()).format('YYYY/MM/DD HH:mm Z'));
            this.nextRound();
        }, null, true);
        log.info('Cron started with patter: ' + cronPattern);
        this.betsJob.start();

        setTimeout(()=>{ // Wait for Store initialization
            notify(`*Bet Bot ${Store.botName} started* for address _${Store.user.ADM.address}_ (ver. ${Store.version}). Current round _${Store.round}_ ends in _${this.getBetDateString('current').tillString}_ (_${this.getBetDateString('current').nextRoundTime}_).`, 'info');
        }, 6000);

        // log.info('111111111111 ' + 1563704365000);
        // log.info('111111111111 ' + Date.now());
        // log.info('111111111111 ' + moment(1563704365000).format('YYYY/MM/DD HH:mm Z'));
        // log.info('111111111111 ' + moment(Date.now()).format('YYYY/MM/DD HH:mm Z'));

        // $u.getFreshCryptoRate('BTC', 1563704365000);
        // $u.getFreshCryptoRate('BTC', Date.now());
        
    },
    async nextRound() {
		try {
			const round = this.round ? ++this.round : 1;
			Store.updateSystem('round', round);

			const {roundsDb} = db;
			const newRound = new roundsDb({
				_id: round,
                createDate: Date.now(),
                duration: getTimeLeft(Date.now()),
                fullRoundDuration: this.getRoundTime(),
				endDate: +this.betsJob.nextDates(),
				packDate: null
			});

			// console.log(newRound);
            await newRound.save();
            let infoString = `New round number ${newRound._id} started at ${moment(newRound.createDate).format('YYYY/MM/DD HH:mm Z')}.`;
            infoString += ` End date: ${moment(newRound.endDate).format('YYYY/MM/DD HH:mm Z')}. Duration: ${$u.timeIntervalDaysHoursMins(newRound.duration)}.`;
            infoString += ` Regular (full) round duration: ${$u.timeIntervalDaysHoursMins(newRound.fullRoundDuration)}.`;
            notify(infoString, 'log');

            calcRounds();
		} catch (e) {
			log.error('Error while starting new round: ' + e);
		}
    },
    async checkRounds() {
		try {

			const round = this.round ? ++this.round : 1;
			Store.updateSystem('round', round);

			const {roundsDb} = db;
			const newRound = new roundsDb({
				_id: round,
                createDate: Date.now(),
                duration: getTimeLeft(Date.now()),
                fullRoundDuration: this.getRoundTime(),
				endDate: +this.betsJob.nextDates(),
				packDate: null
			});

			// console.log(newRound);
            await newRound.save();
            let infoString = `New round number ${newRound._id} started at ${moment(newRound.createDate).format('YYYY/MM/DD HH:mm Z')}.`;
            infoString += ` End date: ${moment(newRound.endDate).format('YYYY/MM/DD HH:mm Z')}. Duration: ${$u.timeIntervalDaysHoursMins(newRound.duration)}.`;
            infoString += ` Regular (full) round duration: ${$u.timeIntervalDaysHoursMins(newRound.fullRoundDuration)}.`;
            notify(infoString, 'log');

            updateRounds();
		} catch (e) {
			log.error('Error while starting new round: ' + e);
		}
	}
}

module.exports.setJob();

