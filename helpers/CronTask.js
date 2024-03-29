const moment = require('moment');
const cron = require('cron');
const db = require('../modules/DB');
const config = require('../modules/configReader');
const log = require('./log');
const helpers = require('./utils');
const Store = require('../modules/Store');
const notify = require('./notify');
const calcRounds = require('../modules/calcRounds');

module.exports = {
  betsJob: null,

  ifCoolPeriod(dateTx) {
    const remainHours = (this.betsJob.nextDates() - dateTx) / 1000 / 60 / 60;
    return remainHours < config.cool_period_hours;
  },

  coolPeriodStartDate() {
    const dateInt = this.betsJob.nextDates() - config.cool_period_hours * 60 * 60 * 1000;
    const dateString = moment(dateInt).format('YYYY/MM/DD HH:mm Z');
    return {
      dateInt,
      dateString,
    };
  },

  getBetDateString(round) {
    let nextRoundTime; let tillString;
    if (round === 'current') {
      nextRoundTime = this.betsJob.nextDates().format('YYYY/MM/DD HH:mm Z');
      tillString = helpers.timeDiffDaysHoursMins(this.betsJob.nextDates(), Date.now());
    } else {
      nextRoundTime = this.betsJob.nextDates(2)[1].format('YYYY/MM/DD HH:mm Z');
      tillString = helpers.timeDiffDaysHoursMins(this.betsJob.nextDates(2)[1], Date.now());
    }
    return {
      nextRoundTime,
      tillString,
    };
  },

  getRoundTime() {
    return this.betsJob.nextDates(2)[1]-this.betsJob.nextDates();
  },

  getTimeLeft(since) {
    const interval = this.betsJob.nextDates()-since;
    return interval > 0 ? interval : 0;
  },

  setJob() {
    const cronPattern = config.bet_period_cron_pattern;
    this.betsJob = cron.job(cronPattern, () => {
      log.log('Cron job started at ' + moment(Date.now()).format('YYYY/MM/DD HH:mm Z'));
      this.nextRound();
    }, null, true);
    log.info('Cron started with pattern: ' + cronPattern);
    this.betsJob.start();

    setTimeout(() => { // Wait for Store initialization
      notify(`**${config.notifyName} started** for address _${Store.user.ADM.address}_ (ver. ${Store.version}). Current round _${Store.round}_ ends in _${this.getBetDateString('current').tillString}_ (_${this.getBetDateString('current').nextRoundTime}_).`, 'info');
    }, 7000);
  },

  async nextRound() {
    try {
      const round = Store.round ? (Store.round + 1) : 1;

      const {RoundsDb} = db;
      const newRound = new RoundsDb({
        _id: round,
        createDate: Date.now(),
        duration: this.getTimeLeft(Date.now()),
        fullRoundDuration: this.getRoundTime(),
        endDate: +this.betsJob.nextDates(),
        packDate: null,
        calcWinnersDate: null,
        createPayoutsDate: null,
      });
      await newRound.save();

      let infoString = `New round number ${newRound._id} started at ${moment(newRound.createDate).format('YYYY/MM/DD HH:mm Z')}.`;
      infoString += ` End date: ${moment(newRound.endDate).format('YYYY/MM/DD HH:mm Z')}. Duration: ${helpers.timeDiffDaysHoursMins(newRound.duration)}.`;
      infoString += ` Full round duration: ${helpers.timeDiffDaysHoursMins(newRound.fullRoundDuration)}.`;
      notify(infoString, 'log');

      Store.updateSystem('round', round);
      calcRounds();
    } catch (e) {
      log.error('Error while starting new round: ' + e);
    }
  },

  async checkRounds() {
    try {
      log.log(`Checking rounds…`);

      let toCreateNewRound = false;

      if (!Store.round) {
        log.log(`Store does not keep round number. Starting first round.`);
        this.nextRound();
        toCreateNewRound = true;
      }

      const {RoundsDb} = db;
      const maxRound = await RoundsDb.findOne({_id: Store.round});

      if (maxRound && Date.now() > maxRound.endDate) {
        log.log(`Date now is later, than current round ends. Time difference: ${helpers.timeDiffDaysHoursMins(Date.now() - maxRound.endDate)}. Starting new round.`);
        this.nextRound();
        toCreateNewRound = true;
      }

      if (!toCreateNewRound) {
        calcRounds();
      }
    } catch (e) {
      log.error('Error while checking rounds: ' + e);
    }
  },
};

module.exports.setJob();

