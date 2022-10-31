const log = require('../helpers/log');
const $u = require('../helpers/cryptos');
const notify = require('../helpers/notify');
const Store = require('./Store');
const db = require('./DB');
const api = require('./api');
const config = require('./configReader');
const helpers = require('../helpers/utils');

module.exports = async (pay, tx) => {
  pay.counterTxDeepValidator = ++pay.counterTxDeepValidator || 0;
  if (!tx) {
    await pay.save();
    return;
  }
  // Fetching addresses from ADAMANT KVS
  try {
    const senderKvsADMAddress = tx.senderId;
    const senderKvsETHAddress = pay.senderKvsETHAddress || await $u.getAddressCryptoFromAdmAddressADM('ETH', tx.senderId);
    const senderKvsLSKAddress = pay.senderKvsLSKAddress || await $u.getAddressCryptoFromAdmAddressADM('LSK', tx.senderId);
    let senderKvsInAddress;

    switch (pay.inCurrency) {
      case ('ETH'):
        senderKvsInAddress = senderKvsETHAddress;
        break;
      case ('ADM'):
        senderKvsInAddress = senderKvsADMAddress;
        break;
      case ('LSK'):
        senderKvsInAddress = senderKvsLSKAddress;
        break;
    }

    pay.update({
      senderKvsInAddress,
      senderKvsADMAddress,
      senderKvsETHAddress,
      senderKvsLSKAddress,
    });

    if (!senderKvsETHAddress) {
      log.error(`Can't get ETH address from KVS. Will try next time.`);
      await pay.save();
      return;
    }

    if (!senderKvsLSKAddress) {
      log.error(`Can't get LSK address from KVS. Will try next time.`);
      await pay.save();
      return;
    }

    let notifyType = 'log';
    if (senderKvsETHAddress === 'none') {
      if (!pay.isKVSnotFoundNotified) {
        notifyType = 'warn';
        notify(`${config.notifyName} cannot fetch _ETH_ address of ${tx.senderId} from KVS. Income ADAMANT Tx: https://explorer.adamant.im/tx/${tx.id}. Will try to send back.`, 'warn');
        const msgSendBack = `I can’t get your _ETH_ address from ADAMANT KVS. It is necessary to send reward in case of win. I'll try to send transfer back to you now. Before next bet, re-login into your ADAMANT account using app that supports _ETH_.`;
        await api.sendMessageWithLog(config.passPhrase, tx.senderId, msgSendBack);
      }
      pay.update({
        error: 8,
        needToSendBack: true,
        isKVSnotFoundNotified: true, // need to verify Tx even if send back
      }, true);
    }

    if (senderKvsLSKAddress === 'none') {
      if (!pay.isKVSnotFoundNotified) {
        notifyType = 'warn';
        notify(`${config.notifyName} cannot fetch _LSK_ address of ${tx.senderId} from KVS. Income ADAMANT Tx: https://explorer.adamant.im/tx/${tx.id}. Will try to send back.`, 'warn');
        const msgSendBack = `I can’t get your _LSK_ address from ADAMANT KVS. It is necessary to send reward in case of win. I'll try to send transfer back to you now. Before next bet, re-login into your ADAMANT account using app that supports _LSK_.`;
        await api.sendMessageWithLog(config.passPhrase, tx.senderId, msgSendBack);
      }
      pay.update({
        error: 8,
        needToSendBack: true,
        isKVSnotFoundNotified: true, // need to verify Tx even if send back
      }, true);
    }

    let msgSendBack = false;
    let msgNotify = false;

    // Validating incoming TX in blockchain of inCurrency
    try {
      const in_tx = await $u[pay.inCurrency].getTransaction(pay.inTxid, tx);
      if (!in_tx) {
        if (pay.counterTxDeepValidator < 20) {
          await pay.save();
          return;
        }
        pay.update({
          transactionIsValid: false,
          isFinished: true,
          error: 10,
        });
        notifyType = 'warn';
        msgNotify = `${config.notifyName} can’t fetch transaction of _${pay.inAmountMessage} ${pay.inCurrency}_ from ${pay.senderId}.`;
        msgSendBack = `I can’t get transaction of _${pay.in_amount_message} ${pay.inCurrency}_ with Tx ID _${pay.inTxid}_ from _ ${pay.inCurrency}_ blockchain. It might be failed or cancelled. If you think it’s a mistake, contact my master.`;
      } else {
        pay.update({
          senderReal: in_tx.sender,
          recipientReal: in_tx.recipient,
          inAmountReal: in_tx.amount,
        });

        if (String(pay.senderReal).toLowerCase() !== String(pay.senderKvsInAddress).toLowerCase()) {
          pay.update({
            transactionIsValid: false,
            isFinished: true,
            error: 11,
          });
          notifyType = 'warn';
          msgNotify = `${config.notifyName} thinks transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ from ${pay.senderId} is wrong. Sender expected: _${pay.senderKvsInAddress}_, but real sender is _${pay.senderReal}_.`;
          msgSendBack = `I can’t validate transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ with Tx ID _${pay.inTxid}_. If you think it’s a mistake, contact my master.`;
        } else if (String(pay.recipientReal).toLowerCase() !== Store.user[pay.inCurrency].address.toLowerCase()) {
          pay.update({
            transactionIsValid: false,
            isFinished: true,
            error: 12,
          });
          notifyType = 'warn';
          msgNotify = `${config.notifyName} thinks transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ from ${pay.senderId} is wrong. Recipient expected: _${Store.user[pay.inCurrency].address}_, but real recipient is _${pay.recipientReal}_.`;
          msgSendBack = `I can’t validate transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ with Tx ID _${pay.inTxid}_. If you think it’s a mistake, contact my master.`;
        } else if (Math.abs(pay.inAmountReal - pay.inAmountMessage) > pay.inAmountReal * 0.005) {
          pay.update({
            transactionIsValid: false,
            isFinished: true,
            error: 13,
          });
          notifyType = 'warn';
          msgNotify = `${config.notifyName} thinks transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ from ${pay.senderId} is wrong. Amount expected: _${pay.inAmountMessage}_, but real amount is _${pay.inAmountReal}_.`;
          msgSendBack = `I can’t validate transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ with Tx ID _${pay.inTxid}_. If you think it’s a mistake, contact my master.`;
        } else { // Transaction is valid
          pay.update({
            transactionIsValid: true,
            inConfirmations: 0,
          });
        }
      }
    } catch (e) {
      log.error('Error while validating non-ADM transaction: ' + e);
    }

    await pay.save();
    if (msgSendBack) {
      notify(msgNotify + ` Tx hash: _${pay.inTxid}_. Income ADAMANT Tx: https://explorer.adamant.im/tx/${tx.id}.`, notifyType);
      await api.sendMessageWithLog(config.passPhrase, tx.senderId, msgSendBack);
    }
  } catch (e) {
    log.error('Error in deepTxValidator module: ' + e);
  }
};

setInterval(async () => {
  const {PaymentsDb} = db;
  (await PaymentsDb.find({
    transactionIsValid: null,
    isFinished: false,
  })).forEach(async (pay) => {
    const tx = await api.get('transactions/get', {id: pay.admTxId});
    if (tx.success) {
      module.exports(pay, tx);
    } else {
      log.warn(`Failed to get transaction of ${helpers.getModuleName(module.id)} module. ${tx.errorMessage}.`);
      module.exports(pay, null);
    }
  });
}, 20 * 1000);
