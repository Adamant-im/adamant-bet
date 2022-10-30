const Store = require('./Store');
const helpers = require('../helpers/utils');
const config = require('./configReader');
const api = require('./api');
const txParser = require('./incomingTxsParser');
const log = require('../helpers/log');

async function check() {
  try {
    if (!Store.lastHeight) {
      return;
    }
    let txs = [];
    const txChat = await api.get('chats/get', {recipientId: config.address, orderBy: 'timestamp:desc', fromHeight: Store.lastHeight - 5});
    if (txChat.success) {
      txs = txs.concat(txChat.data.transactions);
    } else {
      log.warn(`Failed to chat Txs in check() of ${helpers.getModuleName(module.id)} module. ${txChat.errorMessage}.`);
    }

    const txTrx = await api.get('transactions', {fromHeight: Store.lastHeight - 5, 'and:recipientId': config.address, 'and:type': 0});
    if (txTrx.success) {
      txs = txs.concat(txTrx.data.transactions);
    } else {
      log.warn(`Failed to chat Txs in check() of ${helpers.getModuleName(module.id)} module. ${txTrx.errorMessage}.`);
    }

    txs.forEach((tx) => {
      txParser(tx);
    });
    if (txChat.success && txTrx.success) {
      await Store.updateLastBlock();
    }
  } catch (e) {
    log.error('Error while checking new transactions: ' + e);
  }
}
module.exports = () => {
  setInterval(check, 2500);
};
