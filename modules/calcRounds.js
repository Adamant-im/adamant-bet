const moment = require('moment');
const db = require('./DB');
const config = require('./configReader');
const helpers = require('../helpers/utils');
const Store = require('./Store');
const log = require('../helpers/log');
const notify = require('../helpers/notify');
const ccRate = require('../helpers/getCryptoCompareRate');

module.exports = async () => {
  const {RoundsDb} = db;

  (await RoundsDb.find({
    packDate: null,
    _id: {$lt: Store.round}, // calc only ended rounds
  }))
      .forEach(async (cr) => {
        try {
          let {
            _id,
            duration,
            createDate,
            endDate,
            packDate,
            frozenFor24hoursFrom,
            fullRoundDuration,

            winBet,
            rightMargin,
            leftMargin,
            betCurrency,
            winPriceRange,

            totalBetsCount,
            totalSumUsd,
            totalADMbetsCount,
            totalETHbetsCount,
            totalLSKbetsCount,
            totalADMbetsSum,
            totalETHbetsSum,
            totalLSKbetsSum,
            totalADMbetsSumUsd,
            totalETHbetsSumUsd,
            totalLSKbetsSumUsd,
            totalWinnersCount,
            totalWinnersADMCount,
            totalWinnersETHCount,
            totalWinnersLSKCount,
            totalWinnersETHSum,
            totalWinnersADMSum,
            totalWinnersLSKSum,
            totalWinnersUsdSum,
            totalWinnersADMSumUsd,
            totalWinnersETHSumUsd,
            totalWinnersLSKSumUsd,
            totalWinnersWeightedPoolUsd,
          } = cr;

          let infoString = `Packing round ${_id}. Date is ${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')} (${+Date.now()}).`;
          infoString += ` Round created: ${moment(createDate).format('YYYY/MM/DD HH:mm Z')}. Duration: ${helpers.timeDiffDaysHoursMins(duration)}.`;
          infoString += ` Round end date: ${moment(endDate).format('YYYY/MM/DD HH:mm Z')}. Full round duration: ${helpers.timeDiffDaysHoursMins(fullRoundDuration)}.`;
          log.info(infoString);

          totalBetsCount = 0;
          totalSumUsd = 0;
          totalADMbetsCount = 0;
          totalETHbetsCount = 0;
          totalLSKbetsCount = 0;
          totalADMbetsSum = 0;
          totalETHbetsSum = 0;
          totalLSKbetsSum = 0;
          totalADMbetsSumUsd = 0;
          totalETHbetsSumUsd = 0;
          totalLSKbetsSumUsd = 0;
          totalWinnersCount = 0;
          totalWinnersADMCount = 0;
          totalWinnersETHCount = 0;
          totalWinnersLSKCount = 0;
          totalWinnersETHSum = 0;
          totalWinnersADMSum = 0;
          totalWinnersLSKSum = 0;
          totalWinnersUsdSum = 0;
          totalWinnersADMSumUsd = 0;
          totalWinnersETHSumUsd = 0;
          totalWinnersLSKSumUsd = 0;
          totalWinnersWeightedPoolUsd = 0;
          betCurrency = config.bet_currency;

          // When do we start calculating round results?
          const timeSinceEndDate = Date.now() - endDate;
          const absTimeSinceEndDate = Math.abs(timeSinceEndDate);
          const timeDeltaSec = absTimeSinceEndDate / 1000;

          if (timeDeltaSec < 100) { // good, time diff less, than 100 sec
            log.log(`Great, expected time difference in round calculation is ${timeDeltaSec} sec.`);
          } else if (timeSinceEndDate < 0) {
            if (!frozenFor24hoursFrom) {
              const tempWinBetNow = await ccRate.getFreshCryptoRate(betCurrency, Date.now());
              infoString = `*Something is wrong*. We are calculating results for round which doesn't end yet. Is _bet_period_cron_pattern_ changed in config?`;
              infoString += `\n\nRound _${_id}_ will end on _${moment(endDate).format('YYYY/MM/DD HH:mm Z')}_ and now is _${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')}_ (difference: _${helpers.timeDiffDaysHoursMins(absTimeSinceEndDate)}_).`;
              infoString += ` Round created: _${moment(createDate).format('YYYY/MM/DD HH:mm Z')}_. Duration: _${helpers.timeDiffDaysHoursMins(duration)}_.`;
              infoString += ` Full round duration: _${helpers.timeDiffDaysHoursMins(fullRoundDuration)}_.`;
              infoString += ` Actual bet rate now: _${helpers.thousandSeparator(tempWinBetNow, false)}_ USD for _${betCurrency}_.`;
              infoString += `\n\nCalculation for this round will be paused for 24 hours. If no action is taken, calculation will be continued and reward payments processed.`;

              await cr.update({
                frozenFor24hoursFrom: Date.now(),
              }, true);

              notify(infoString, 'error');
              return;
            } else if (helpers.timeDiff(Date.now(), frozenFor24hoursFrom, 'hours') < 24) {
              return;
            } else { // More, then 24 hours passed. Continue
              infoString = `No action is taken about warning for round _${_id}_. Calculation will be continued and reward payments processed.`;
              notify(infoString, 'warn');
            }
          } else {// timeSinceEndDate > 0
            log.warn(`We are calculating results for round ended in the past. Time difference ${helpers.timeDiffDaysHoursMins(absTimeSinceEndDate)}.`);
            // TODO: check if not more, than 7 days, other way need to use other method.
          }

          // TODO: check endDate in Future?
          winBet = await ccRate.getFreshCryptoRate(betCurrency, endDate);

          if (!winBet) {
            log.warn(`Round calculation stopped as we didn't receive crypto rate for ${betCurrency} on ${moment(endDate).format('YYYY/MM/DD HH:mm Z')}. Will try next time.`);
            return;
          }

          winPriceRange = config.win_price_range;
          leftMargin = winBet - winPriceRange;
          rightMargin = winBet + winPriceRange;

          const {PaymentsDb} = db;

          log.log(`Calculating all of validated transactions for round ${_id}. Date is ${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')}.`);
          await (await PaymentsDb.find({ // Select all of validated transactions for this round
            transactionIsConfirmed: true,
            transactionIsValid: true,
            transactionIsFailed: false,
            needToSendBack: false,
            needHumanCheck: false,
            inTxStatus: true,
            betRound: _id,
          }))
              .forEach(async (pay) => {
                log.log(`1/ Bet on round ${_id}: Tx ${pay.admTxId} — ${pay.betMessageTextNoMarkdown}.`);

                totalBetsCount++;
                totalSumUsd+= pay.inAmountMessageUsd;

                pay.isWinner = (pay.betRateValue < rightMargin) && (pay.betRateValue > leftMargin);
                pay.betRateDelta = Math.abs(pay.betRateValue-winBet);

                if (pay.isWinner) {
                  pay.accuracyKoef = 1 + (winPriceRange - pay.betRateDelta) / winPriceRange;
                  pay.weightedValueUsd = pay.accuracyKoef * pay.earlyBetKoef * pay.inAmountMessageUsd;

                  totalWinnersCount++;
                  totalWinnersUsdSum+= pay.inAmountMessageUsd;
                  totalWinnersWeightedPoolUsd+= pay.weightedValueUsd;
                } else {
                  pay.accuracyKoef = 0;
                  pay.weightedValueUsd = 0;
                }

                switch (pay.inCurrency) {
                  case ('ETH'):
                    totalETHbetsCount++;
                    totalETHbetsSum+= pay.inAmountMessage;
                    totalETHbetsSumUsd+= pay.inAmountMessageUsd;
                    if (pay.isWinner) {
                      totalWinnersETHCount++;
                      totalWinnersETHSum+= pay.inAmountMessage;
                      totalWinnersETHSumUsd+= pay.inAmountMessageUsd;
                    }
                    break;
                  case ('ADM'):
                    totalADMbetsCount++;
                    totalADMbetsSum+= pay.inAmountMessage;
                    totalADMbetsSumUsd+= pay.inAmountMessageUsd;
                    if (pay.isWinner) {
                      totalWinnersADMCount++;
                      totalWinnersADMSum+= pay.inAmountMessage;
                      totalWinnersADMSumUsd+= pay.inAmountMessageUsd;
                    }
                    break;
                  case ('LSK'):
                    totalLSKbetsCount++;
                    totalLSKbetsSum+= pay.inAmountMessage;
                    totalLSKbetsSumUsd+= pay.inAmountMessageUsd;
                    if (pay.isWinner) {
                      totalWinnersLSKCount++;
                      totalWinnersLSKSum+= pay.inAmountMessage;
                      totalWinnersLSKSumUsd+= pay.inAmountMessageUsd;
                    }
                    break;
                }

                await pay.save();
              });

          // might not be calculated YET?

          cr.rewardPoolUsd = totalSumUsd * (1-config.bureau_reward_percent/100);
          cr.rewardPoolADM = totalADMbetsSum * (1-config.bureau_reward_percent/100);
          cr.rewardPoolETH = totalETHbetsSum * (1-config.bureau_reward_percent/100);
          cr.rewardPoolLSK = totalLSKbetsSum * (1-config.bureau_reward_percent/100);

          const betsString = [];
          config.accepted_crypto.forEach(async (coin) => {
            const betFieldName = `total${coin}betsSum`;
            betsString.push(`*${helpers.thousandSeparator(+(eval(betFieldName).toFixed(8)), false)}* _${coin}_`);
          });

          const poolsString = [];
          config.accepted_crypto.forEach(async (coin) => {
            const rewardPoolFieldName = 'rewardPool' + coin;
            poolsString.push(`*${helpers.thousandSeparator(+(cr[rewardPoolFieldName].toFixed(8)), false)}* _${coin}_`);
          });

          let msgNotify = '';
          msgNotify = `${config.notifyName} has finished packing round number _${_id}_. Current date is _${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')}_ (${+Date.now()}).`;
          msgNotify += ` Win rate: _${helpers.thousandSeparator(winBet, false)}_ USD for 1 _${betCurrency}_.`;
          msgNotify += ` Total bets — _${helpers.thousandSeparator(totalBetsCount, false)}_ with _~${helpers.thousandSeparator(totalSumUsd.toFixed(2), false)}_ USD wagered:`;
          msgNotify += ` ${betsString.join(', ')}.`;
          msgNotify += `\n\nWinners' bets — _${helpers.thousandSeparator(totalWinnersCount, false)}_ with _~${helpers.thousandSeparator(totalWinnersUsdSum.toFixed(2), false)}_ USD wagered.`;
          msgNotify += ` Total rewards: ${poolsString.join(', ')} (*~${helpers.thousandSeparator(cr.rewardPoolUsd.toFixed(2), false)}* _USD_ at time of bets placed).`;
          notify(msgNotify, 'log');

          packDate = Date.now();
          await cr.update({
            packDate,
            frozenFor24hoursFrom,

            winBet,
            rightMargin,
            leftMargin,
            betCurrency,
            winPriceRange,

            totalBetsCount,
            totalSumUsd,
            totalADMbetsCount,
            totalETHbetsCount,
            totalLSKbetsCount,
            totalADMbetsSum,
            totalETHbetsSum,
            totalLSKbetsSum,
            totalADMbetsSumUsd,
            totalETHbetsSumUsd,
            totalLSKbetsSumUsd,
            totalWinnersCount,
            totalWinnersADMCount,
            totalWinnersETHCount,
            totalWinnersLSKCount,
            totalWinnersETHSum,
            totalWinnersADMSum,
            totalWinnersLSKSum,
            totalWinnersUsdSum,
            totalWinnersADMSumUsd,
            totalWinnersETHSumUsd,
            totalWinnersLSKSumUsd,
            // rewardPoolUsd, // these values saved to cr. directly in order to access rewardPoolFieldName
            // rewardPoolADM,
            // rewardPoolETH,
            totalWinnersWeightedPoolUsd,
          }, true);
        } catch (e) {
          log.error('Error in calcRounds module: ' + e);
        }
      });
};

setInterval(() => {
  module.exports();
}, 60 * 1000);
