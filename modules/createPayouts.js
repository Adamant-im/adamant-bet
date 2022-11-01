const moment = require('moment');
const db = require('./DB');
const config = require('./configReader');
const helpers = require('../helpers/utils');
const Store = require('./Store');
const log = require('../helpers/log');
const api = require('./api');

module.exports = async () => {
  const {RoundsDb} = db;

  (await RoundsDb.find({
    createPayoutsDate: null,
    calcWinnersDate: {$ne: null},
    packDate: {$ne: null},
    _id: {$lt: Store.round}, // calc only ended rounds
  }))
      .forEach(async (cr) => {
        try {
          const {
            _id,
            duration,
            createDate,
            endDate,
            fullRoundDuration,

            winBet,
            totalWinnersCount,
          } = cr;

          let infoString = `Creating payouts for round ${_id}. Date is ${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')} (${+Date.now()}).`;
          infoString += ` Round created: ${moment(createDate).format('YYYY/MM/DD HH:mm Z')}. Duration: ${helpers.timeDiffDaysHoursMins(duration)}.`;
          infoString += ` Round end date: ${moment(endDate).format('YYYY/MM/DD HH:mm Z')}. Full round duration: ${helpers.timeDiffDaysHoursMins(fullRoundDuration)}.`;
          log.info(infoString);

          const {PaymentsDb} = db;
          (await PaymentsDb.find({
            betRound: _id,
            isCalculated: true,
            isFinished: false,
          })).forEach(async (pay) => {
            let {
              isFinished,
              isWinner,
              admTxId,
              senderId,
              accuracyKoef,
              earlyBetKoef,
              betMessageText,
              betMessageTextNoMarkdown,
              payoutValueUsd,
            } = pay;

            log.log(`3/ Payment for round ${_id}: Tx ${admTxId} — ${betMessageTextNoMarkdown}.`);

            let msgSendBack = ``;
            const rewardsString = [];
            let newPayout;

            if (isWinner) {
              const {RewardsPayoutsDb} = db;

              // If no payout Tx added earlier, add it now for each of accepted coins
              let checkedTx;
              config.accepted_crypto.forEach(async (coin) => {
                const senderKvsFieldName = 'senderKvs' + coin + 'Address';
                const payoutValueFieldName = 'payoutValue' + coin;
                rewardsString.push(`**${helpers.thousandSeparator(+(pay[payoutValueFieldName].toFixed(8)), false)}** _${coin}_`);

                checkedTx = await RewardsPayoutsDb.findOne({admTxId: pay.itxId, outCurrency: coin});
                if (checkedTx === null) {
                  newPayout = new RewardsPayoutsDb({
                    itxId: pay.admTxId,
                    senderId: pay.senderId,
                    isFinished: false,
                    isPaused: false,
                    triesSendCounter: 0,
                    triesValidateCounter: 0,
                    betRound: pay.betRound,
                    winBet: winBet,
                    accuracyKoef: pay.accuracyKoef,
                    earlyBetKoef: pay.earlyBetKoef,
                    calcDate: Date.now(),
                    senderKvsOutAddress: pay[senderKvsFieldName],
                    betMessageText: pay.betMessageText,
                    outCurrency: coin,
                    outAmount: +(pay[payoutValueFieldName].toFixed(8)),
                    outAmountF: helpers.thousandSeparator(+(pay[payoutValueFieldName].toFixed(8)), false),
                    outAmountUsd: Store.cryptoConvert(coin, 'USD', pay[payoutValueFieldName]).outAmount,
                    outAmountUsdF: helpers.thousandSeparator(Store.cryptoConvert(coin, 'USD', pay[payoutValueFieldName])).outAmount,
                    outTxid: null,
                    isPayoutMade: false,
                    needHumanCheck: null,
                  });

                  const addressString = newPayout.senderKvsOutAddress === newPayout.senderId ? newPayout.senderKvsOutAddress : newPayout.senderKvsOutAddress + ' (' + newPayout.senderId + ')';
                  log.log(`Created reward payment of ${newPayout.outAmount} ${newPayout.outCurrency} to ${addressString} / Tx ${newPayout.itxId} (round ${newPayout.betRound}).`);
                  await newPayout.save();
                }
              });

              msgSendBack = `**Bingo!** Your bet of ${betMessageText} won! Actual rate is _${helpers.thousandSeparator(winBet, false)}_ USD, accuracy koef — _${accuracyKoef.toFixed(2)}_. Early bet koef is _${earlyBetKoef.toFixed(2)}_.`;
              msgSendBack += `\n\nRewards are distributed among ${totalWinnersCount} winners. For this bet, rewards are:`;
              msgSendBack += ` ${rewardsString.join(', ')} (**~${helpers.thousandSeparator(payoutValueUsd.toFixed(2), false)} USD** at time of bets placed).`;
              msgSendBack += ` I will send these funds soon, please be patient. Wish you luck next rounds!`;
            } else { // if isWinner === false
              msgSendBack = `D'oh! Your bet of ${betMessageText} lose. Actual rate is _${helpers.thousandSeparator(winBet, false)}_ USD. Wish you luck next rounds!`;
            }

            let logString = '';
            logString = `Round ${_id} results for ${senderId} / ${admTxId}: ${isWinner}.`;
            logString += ` Actual rate: ${helpers.thousandSeparator(winBet, false)} USD, accuracy koef: ${accuracyKoef.toFixed(2)}, Early bet koef: ${earlyBetKoef.toFixed(2)}.`;
            if (pay.isWinner) {
              logString += ` Rewards are: ${rewardsString.join(', ')} (~${helpers.thousandSeparator(payoutValueUsd.toFixed(2), false)} USD at time of bets placed).`;
            }
            logString += ` Bet message text: ${betMessageText}.`;

            log.log(logString);
            await api.sendMessageWithLog(config.passPhrase, senderId, msgSendBack);

            isFinished = true;
            await pay.update({
              isFinished,
            }, true);
          });

          const createPayoutsDate = Date.now();
          await cr.update({
            createPayoutsDate,
          }, true);
        } catch (e) {
          log.error('Error in calcWinners module: ' + e);
        }
      });
};

setInterval(() => {
  module.exports();
}, 60 * 1000);
