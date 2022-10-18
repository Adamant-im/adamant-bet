const db = require('./DB');
const config = require('./configReader');
const $u = require('../helpers/utils');
const Store = require('./Store');
const log = require('../helpers/log');
const notify = require('../helpers/notify');

module.exports = async () => {
  const {RewardsPayoutsDb} = db;

  (await RewardsPayoutsDb.find({
    isFinished: false,
    isPaused: false,
    isPayoutMade: false,
    outTxid: null,
  })).forEach(async (payout) => {
    let {
      itxId,
      senderId,
      betRound,
      senderKvsOutAddress,
      outCurrency,
      outAmount,
      outAmountUsd,
      outAmountF,
      triesSendCounter,
    } = payout;

    // If round is not fully calculated yet, do nothing
    const {RoundsDb} = db;
    const payoutRound = await RoundsDb.findOne({_id: betRound});
    if (!payoutRound.createPayoutsDate) {
      log.info(`Attempt to make payout for not fully calculated round ${betRound}. Will try next time.`);
      return;
    }

    triesSendCounter += 1;
    const toBePaused = triesSendCounter > 50 ? true : false;

    const etherString = '';
    const addressString = senderKvsOutAddress === senderId ? senderKvsOutAddress : senderKvsOutAddress + ' (' + senderId + ')';
    let logString = '';
    const minRewardUsd = config.min_reward_usd;
    const minRewardUsdF = $u.thousandSeparator(minRewardUsd, false);

    if (!outAmount || outAmount === 0) {
      await payout.update({
        isZeroAmount: true,
        isFinished: true,
        triesSendCounter,
      }, true);
      logString = `Amount is ${outAmount} ${outCurrency} for payout to ${addressString} / Tx ${itxId} (round ${betRound}). Skipping.`;
      log.info(logString);
      return;
    } else if (outAmountUsd < minRewardUsd) {
      await payout.update({
        error: 17,
        isFinished: true,
        triesSendCounter,
      }, true);
      notify(`Bet Bot ${Store.botName} won’t send reward of _${outAmountF} ${outCurrency}_ to _${addressString}_ in round _${betRound}_ because it is less than minimum amount of _${minRewardUsdF}_ USD. Income ADAMANT Tx: https://explorer.adamant.im/tx/${itxId}.`, log);
      $u.sendAdmMsg(senderId, `I wouldn’t send you reward payment of _${outAmountF} ${outCurrency}_ because it is less than minimum amount of _${minRewardUsdF}_ USD.`);
      return;
    } else if (outAmount + $u[outCurrency].FEE > Store.user[outCurrency].balance) {
      if (toBePaused) {
        await payout.update({
          error: 15,
          isPaused: toBePaused,
          triesSendCounter,
        }, true);
        notify(`Bet Bot ${Store.botName} notifies about insufficient balance for reward of _${outAmount}_ _${outCurrency}_ to _${addressString}_ in round _${betRound}_. Tried 50 times. Payout is paused, attention needed. Balance of _${outCurrency}_ is _${Store.user[outCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${itxId}.`, 'error');
        $u.sendAdmMsg(senderId, `I can’t send you reward payment of _${outAmount}_ _${outCurrency}_ because of insufficient funds. I've already notified my master.`);
      } else {
        log.warn(`Bet Bot ${Store.botName} notifies about insufficient balance for reward of _${outAmount}_ _${outCurrency}_ to _${addressString}_ in round _${betRound}_. Tries counter: ${triesSendCounter} times. Balance of _${outCurrency}_ is _${Store.user[outCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${itxId}.`);
      }
      await payout.update({
        triesSendCounter,
      }, true);
      return;
    }

    log.info(`Attempt to send reward payment of ${outAmount} ${outCurrency} to ${addressString} / Tx ${itxId} (round ${betRound}). Tries counter: ${triesSendCounter} times.`);
    const result = await $u[outCurrency].send({
      address: senderKvsOutAddress,
      value: outAmount,
      comment: 'Hey, you are lucky! Waiting for new bets!', // if ADM
    });
    log.info(`Reward payment result: ${JSON.stringify(result, 0, 2)}.`);

    if (result.success) {
      await payout.update({
        payoutDate: Date.now(),
        isPayoutMade: true,
        outTxid: result.hash,
      }, true);
      Store.user[outCurrency].balance -= (outAmount + $u[outCurrency].FEE);
      log.info(`Successful reward payment of ${outAmount} ${outCurrency} to ${addressString} / Tx ${itxId} (round ${betRound}). Hash: ${result.hash}.`);
    } else { // Can't make a transaction
      if (toBePaused) {
        await payout.update({
          error: 16,
          isPaused: toBePaused,
          triesSendCounter,
        }, true);
        notify(`Bet Bot ${Store.botName} unable to make reward transaction of _${outAmount}_ _${outCurrency}_ to _${addressString}_ in round _${betRound}_. Tried 50 times. Payout is paused, attention needed. Balance of _${outCurrency}_ is _${Store.user[outCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${itxId}.`, 'error');
        $u.sendAdmMsg(senderId, `I’ve tried to make transfer of _${outAmount}_ _${outCurrency}_ to you, but something went wrong. I've already notified my master.`);
      } else {
        log.warn(`Bet Bot ${Store.botName} unable to make reward transaction of _${outAmount}_ _${outCurrency}_ to _${addressString}_ in round _${betRound}_. Tries counter: ${triesSendCounter} times. Balance of _${outCurrency}_ is _${Store.user[outCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${itxId}.`);
      }
    }

    await payout.update({
      triesSendCounter,
    });

    await payout.save();
  });
};

setInterval(() => {
  module.exports();
}, 30 * 1000);
