const moment = require('moment');
const db = require('./DB');
const helpers = require('../helpers/utils');
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
            rewardPoolLSK,
            totalWinnersWeightedPoolUsd,
          } = cr;

          let infoString = `Calculating rewards for round ${_id}. Date is ${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')} (${+Date.now()}).`;
          infoString += ` Round created: ${moment(createDate).format('YYYY/MM/DD HH:mm Z')}. Duration: ${helpers.timeDiffDaysHoursMins(duration)}.`;
          infoString += ` Round end date: ${moment(endDate).format('YYYY/MM/DD HH:mm Z')}. Full round duration: ${helpers.timeDiffDaysHoursMins(fullRoundDuration)}.`;
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
              payoutValueLSK,
              payoutValueUsd,
            } = pay2;

            if (isWinner) {
              rewardPercent = weightedValueUsd / totalWinnersWeightedPoolUsd;
              payoutValueADM = rewardPercent * rewardPoolADM;
              payoutValueETH = rewardPercent * rewardPoolETH;
              payoutValueLSK = rewardPercent * rewardPoolLSK;
              payoutValueUsd = rewardPercent * rewardPoolUsd;
            }

            isCalculated = true;
            await pay2.update({
              isCalculated,
              rewardPercent,
              payoutValueADM,
              payoutValueETH,
              payoutValueLSK,
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
