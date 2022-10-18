const moment = require('moment');
const db = require('./DB');
const $u = require('../helpers/utils');
const Store = require('./Store');
const log = require('../helpers/log');

module.exports = async () => {
  const {RoundsDb} = db;

  (await RoundsDb.find({
    calcWinnersDate: null,
    packDate: {$ne: null},
    _id: {$lt: Store.round}, // calc only ended rounds
  }))
      .forEach(async (cr) => {
        try {
          let {
            _id,
            duration,
            createDate,
            endDate,
            fullRoundDuration,
            calcWinnersDate,
            rewardPoolUsd,
            rewardPoolADM,
            rewardPoolETH,
            totalWinnersWeightedPoolUsd,
          } = cr;

          let infoString = `Calculating rewards for round ${_id}. Date is ${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')} (${+Date.now()}).`;
          infoString += ` Round created: ${moment(createDate).format('YYYY/MM/DD HH:mm Z')}. Duration: ${$u.timeDiffDaysHoursMins(duration)}.`;
          infoString += ` Round end date: ${moment(endDate).format('YYYY/MM/DD HH:mm Z')}. Full round duration: ${$u.timeDiffDaysHoursMins(fullRoundDuration)}.`;
          log.info(infoString);

          const {PaymentsDb} = db;
          (await PaymentsDb.find({
            betRound: _id,
            isFinished: false,
          })).forEach(async (pay2) => {
            let {
              isCalculated,
              isWinner,
              weightedValueUsd,
              rewardPercent,
              payoutValueADM,
              payoutValueETH,
              payoutValueUsd,
            } = pay2;

            if (isWinner) {
              rewardPercent = weightedValueUsd / totalWinnersWeightedPoolUsd;
              payoutValueADM = rewardPercent * rewardPoolADM;
              payoutValueETH = rewardPercent * rewardPoolETH;
              payoutValueUsd = rewardPercent * rewardPoolUsd;
            }

            isCalculated = true;
            await pay2.update({
              isCalculated,
              rewardPercent,
              payoutValueADM,
              payoutValueETH,
              payoutValueUsd,
            }, true);
          });

          calcWinnersDate = Date.now();
          await cr.update({
            calcWinnersDate,
          }, true);
        } catch (e) {
          log.error('Error in calcWinners module: ' + e);
        }
      });
};

setInterval(() => {
  module.exports();
}, 60 * 1000);
