const api = require('./api');
const db = require('./DB');
const config = require('./configReader');
const $u = require('../helpers/cryptos');
const Store = require('./Store');
const log = require('../helpers/log');
const notify = require('../helpers/notify');

module.exports = async () => {
  const {PaymentsDb} = db;
  const lastBlockNumber = {
    ETH: await $u.ETH.getLastBlock(),
    ADM: await $u.ADM.getLastBlock(),
    LSK: await $u.LSK.getLastBlock(),
  };

  (await PaymentsDb.find({
    $and: [
      {isFinished: false},
      {sentBackTx: {$ne: null}},
    ],
  })).forEach(async (pay) => {
    const {
      inCurrency,
      admTxId,
      inAmountMessage,
      sentBackAmount,
    } = pay;

    pay.tryCounterCheckOutTX = ++pay.tryCounterCheckOutTX || 0;

    const etherString = '';
    let notifyType;

    const sendCurrency = inCurrency;
    const sendTxId = pay.sentBackTx;
    const sendAmount = sentBackAmount;

    try {
      let msgNotify = null;
      let msgSendBack = null;

      if (!lastBlockNumber[sendCurrency]) {
        log.warn(`Cannot get lastBlockNumber for ${sendCurrency}. Waiting for next try.`);
        return;
      }

      const txData = (await $u[sendCurrency].getTransactionStatus(sendTxId));
      if (!txData || !txData.blockNumber) {
        if (pay.tryCounterCheckOutTX > 50) {
          pay.update({
            errorCheckOuterTX: 24,
            isFinished: true,
            needHumanCheck: true,
          });

          notifyType = 'error';
          msgNotify = `${config.notifyName} unable to verify sent back of _${inAmountMessage} ${inCurrency}_ to ${pay.senderId}. Insufficient balance? Attention needed. Tx hash: _${sendTxId}_. Balance of _${sendCurrency}_ is _${Store.user[sendCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${admTxId}.`;
          msgSendBack = `I’ve tried to send back the transfer to you, but I cannot validate transaction. Tx hash: _${sendTxId}_. I’ve already notified my master. If you wouldn’t receive transfer in two days, contact my master also.`;

          notify(msgNotify, notifyType);
          await api.sendMessageWithLog(config.passPhrase, pay.senderId, msgSendBack);
        }
        await pay.save();
        return;
      }
      const {status, blockNumber} = txData;

      if (!blockNumber) {
        log.warn(`Cannot get blockNumber to verify sent back of _${inAmountMessage} ${inCurrency}_ to ${pay.senderId}. Waiting for next try. Income ADAMANT Tx: https://explorer.adamant.im/tx/${admTxId}.`);
        return;
      }

      pay.update({
        outTxStatus: status,
        outConfirmations: lastBlockNumber[sendCurrency] - blockNumber,
      });

      if (status === false) {
        notifyType = 'error';

        pay.update({
          errorValidatorSend: 22,
          sentBackTx: null,
        });

        msgNotify = `${config.notifyName} sent back of _${inAmountMessage} ${inCurrency}_ to ${pay.senderId} failed. Tx hash: _${sendTxId}_. Will try again. Balance of _${sendCurrency}_ is _${Store.user[sendCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${admTxId}.`;
        msgSendBack = `I’ve tried to send the transfer back, but it seems transaction failed. Tx hash: _${sendTxId}_. I will try again. If I’ve said the same several times already, please contact my master.`;

        await api.sendMessageWithLog(config.passPhrase, pay.senderId, msgSendBack);
      } else if (status && pay.outConfirmations >= config['min_confirmations_' + sendCurrency]) {
        notifyType = 'log';
        msgNotify = `${config.notifyName} successfully sent back _${inAmountMessage} ${inCurrency}_ to ${pay.senderId} with Tx hash: _${sendTxId}_. Income ADAMANT Tx: https://explorer.adamant.im/tx/${admTxId}.`;
        msgSendBack = 'Here is your refund. Note, some amount spent to cover blockchain fees. Try again!';

        if (sendCurrency !== 'ADM') {
          msgSendBack = `{"type":"${sendCurrency.toLowerCase()}_transaction","amount":"${sendAmount}","hash":"${sendTxId}","comments":"${msgSendBack}"}`;
          const message = await api.sendMessageWithLog(config.passPhrase, pay.senderId, msgSendBack, 'rich');
          if (message?.success) {
            pay.isFinished = true;
          } else {
            log.warn(`Failed to send ADM message on sent Tx ${sendTxId} of ${sendAmount} ${sendCurrency} to ${pay.senderId}. I will try again. ${message?.errorMessage}.`);
          }
        } else {
          pay.isFinished = true;
        }
      }
      await pay.save();

      if (msgNotify) {
        notify(msgNotify, notifyType);
      }
    } catch (e) {
      log.error(`Error in sendBackTxValidator module: ${e}`);
    }
  });
};

setInterval(() => {
  module.exports();
}, 15 * 1000);
