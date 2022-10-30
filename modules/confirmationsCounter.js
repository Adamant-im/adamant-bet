const db = require('./DB');
const config = require('./configReader');
const $u = require('../helpers/cryptos');
const helpers = require('../helpers/utils');
const Store = require('./Store');
const log = require('../helpers/log');
const notify = require('../helpers/notify');
const api = require('./api');

module.exports = async () => {
  const {PaymentsDb} = db;

  const lastBlockNumber = {
    ETH: await $u.ETH.getLastBlock(),
    ADM: await $u.ADM.getLastBlock(),
    LSK: await $u.LSK.getLastBlock(),
  };

  (await PaymentsDb.find({
    transactionIsValid: true,
    transactionIsConfirmed: false,
    isFinished: false,
    transactionIsFailed: false,
  })).forEach(async (pay) => {
    try {
      let msgNotify = null;
      let msgSendBack = null;
      let notifyType;

      const {
        inCurrency,
        inTxid,
        inAmountMessage,
        admTxId,
      } = pay;

      if (!lastBlockNumber[inCurrency]) {
        log.warn('Cannot get lastBlockNumber for ' + inCurrency + '. Waiting for next try.');
        return;
      }
      const txData = (await $u[inCurrency].getTransactionStatus(inTxid));
      if (!txData || !txData.blockNumber) {
        log.warn(`Cannot get txData to calc confirmations for transaction _${inTxid}_ of _${inAmountMessage}_ _${inCurrency}_. Waiting for next try.`);
        return;
      }
      const {status, blockNumber} = txData;

      if (!blockNumber) {
        log.warn(`Cannot get blockNumber to calc confirmations for transaction _${inTxid}_ of _${inAmountMessage}_ _${inCurrency}_. Waiting for next try.`);
        return;
      }

      pay.update({
        inTxStatus: status,
        inConfirmations: lastBlockNumber[inCurrency] - blockNumber,
      });

      if (status === false) {
        pay.update({
          error: 14,
          transactionIsFailed: true,
          isFinished: true,
        });
        notifyType = 'error';
        msgNotify = `config.notifyName notifies transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ is Failed. Tx hash: _${inTxid}_. Income ADAMANT Tx: https://explorer.adamant.im/tx/${admTxId}.`;
        msgSendBack = `Transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ with Tx ID _${inTxid}_ is Failed and will not be processed. Check _${pay.inCurrency}_ blockchain explorer and try again. If you think it’s a mistake, contact my master.`;
      } else if (pay.inTxStatus && pay.inConfirmations >= config['min_confirmations_' + inCurrency]) { // Tx verified
        pay.update({
          transactionIsConfirmed: true,
        });
        if (!pay.isKVSnotFoundNotified && !pay.needToSendBack) {
          notifyType = 'info';
          msgNotify = `config.notifyName successfully validated bet of ${pay.betMessageText}.`;
          msgSendBack = `I have **validated and accepted** your bet of ${pay.betMessageText}. I will notify you about results in ${helpers.timeDiffDaysHoursMins(pay.betRoundEndTime, Date.now())}. Wish you success!`;
        }
      }

      await pay.save();

      if (msgSendBack) {
        notify(msgNotify, notifyType);
        await api.sendMessageWithLog(config.passPhrase, pay.senderId, msgSendBack);
      }
    } catch (e) {
      log.error('Error in ConfirmationsCounter module: ' + e);
    }
  });
};
setInterval(() => {
  module.exports();
}, 15 * 1000);
