const db = require('./DB');
const config = require('./configReader');
const $u = require('../helpers/cryptos');
const helpers = require('../helpers/utils');
const Store = require('./Store');
const log = require('../helpers/log');
const notify = require('../helpers/notify');
const api = require('./api');

module.exports = async () => {
  const {RewardsPayoutsDb} = db;
  const lastBlockNumber = {
    ETH: await $u.ETH.getLastBlock(),
    ADM: await $u.ADM.getLastBlock(),
    LSK: await $u.LSK.getLastBlock(),
  };

  (await RewardsPayoutsDb.find({
    isFinished: false,
    isPayoutMade: true,
    outTxid: {$ne: null},
  })).forEach(async (payout) => {
    let {
      itxId,
      senderId,
      betRound,
      senderKvsOutAddress,
      outCurrency,
      outAmount,
      triesValidateCounter,
      outTxid,
    } = payout;

    triesValidateCounter += 1;
    await payout.update({
      triesValidateCounter,
    });

    const etherString = '';

    const addressString = senderKvsOutAddress === senderId ? senderKvsOutAddress : senderKvsOutAddress + ' (' + senderId + ')';

    const sendCurrency = outCurrency;
    const sendTxId = outTxid;

    try {
      if (!lastBlockNumber[sendCurrency]) {
        log.warn(`Cannot get lastBlockNumber for ${sendCurrency}. Waiting for next try.`);
        return;
      }
      const txData = (await $u[sendCurrency].getTransactionStatus(sendTxId));
      if (!txData || !txData.blockNumber) {
        if (triesValidateCounter > 50) {
          await payout.update({
            error: 24,
            isFinished: true,
            needHumanCheck: true,
          });
          notify(`${config.notifyName} unable to verify the reward transaction of _${outAmount}_ _${outCurrency}_ to _${addressString}_ in round _${betRound}_. Tx hash: _${sendTxId}_. Tried 50 times. Payout is paused, attention needed. Balance of _${outCurrency}_ is _${Store.user[outCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${itxId}.`, 'error');
          const msgSendBack = `I’ve tried to make the reward transfer of _${outAmount}_ _${outCurrency}_ to you, but I cannot validate transaction. Tx hash: _${sendTxId}_. I’ve already notified my master. If you wouldn’t receive transfer in two days, contact my master as well.`;
          await api.sendMessageWithLog(config.passPhrase, senderId, msgSendBack);
        }
        await payout.save();
        return;
      }
      const {status, blockNumber} = txData;

      if (!blockNumber) {
        log.warn(`Cannot get blockNumber to verify the reward transaction of _${outAmount}_ _${outCurrency}_ to _${addressString}_ in round _${betRound}_. Waiting for next try.`);
        return;
      }

      await payout.update({
        outTxStatus: status,
        outConfirmations: lastBlockNumber[sendCurrency] - blockNumber,
      }, true);

      if (status === false) {
        await payout.update({
          error: 31,
          outTxid: null,
          isPayoutMade: false,
        });
        notify(`${config.notifyName} notifies that the reward transaction of _${outAmount}_ _${outCurrency}_ to _${addressString}_ in round _${betRound}_ failed. Tx hash: _${sendTxId}_. Will try again. Balance of _${sendCurrency}_ is _${Store.user[sendCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${itxId}.`, 'error');
        const msgSendBack = `I’ve tried to make the transfer of _${outAmount}_ _${outCurrency}_ to you, but it seems transaction failed. Tx hash: _${sendTxId}_. I will try again. If I’ve said the same several times already, please contact my master.`;
        await api.sendMessageWithLog(config.passPhrase, senderId, msgSendBack);
      } else if (status && payout.outConfirmations >= config['min_confirmations_' + sendCurrency]) {
        notify(`${config.notifyName} successfully payed the reward of _${outAmount}_ _${outCurrency}_ to _${addressString}_ in round _${betRound}_. Tx hash: _${sendTxId}_. Income ADAMANT Tx: https://explorer.adamant.im/tx/${itxId}.`, 'info');
        let msgSendBack = 'Hey, you are lucky! Waiting for new bets!';

        if (sendCurrency !== 'ADM') {
          msgSendBack = `{"type":"${outCurrency.toLowerCase()}_transaction","amount":"${outAmount}","hash":"${outTxid}","comments":"${msgSendBack}"}`;
          const message = await api.sendMessageWithLog(config.passPhrase, senderId, msgSendBack, 'rich');
          if (message.success) {
            payout.isFinished = true;
          } else {
            log.warn(`Failed to send ADM message on sent Tx ${outTxid} of ${outAmount} ${outCurrency} to ${senderId}. I will try again. ${message?.errorMessage}.`);
          }
        } else {
          payout.isFinished = true;
        }
      }

      await payout.save();
    } catch (e) {
      log.error(`Error in ${helpers.getModuleName(module.id)}: ${e}`);
    }
  });
};

setInterval(() => {
  module.exports();
}, 15 * 1000);
