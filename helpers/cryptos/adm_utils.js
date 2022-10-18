const Store = require('../../modules/Store');
const helpers = require('../utils');
const config = require('../../modules/configReader');
const api = require('../../modules/api');
const log = require('../../helpers/log');

const {
  SAT,
} = require('../const');
const User = Store.user.ADM;

module.exports = {
  get FEE() {
    return Store.comissions.ADM;
  },
  syncGetTransaction(hash, tx) {
    return {
      blockNumber: tx.blockId,
      hash: tx.id,
      sender: tx.senderId,
      recipient: tx.recipientId,
      amount: +(tx.amount / SAT).toFixed(8),
    };
  },
  async getLastBlock() {
    const blocks = await api.get('blocks', {limit: 1});
    if (blocks.success) {
      return blocks.data.blocks[0].height;
    } else {
      log.warn(`Failed to get last block in getLastBlock() of ${helpers.getModuleName(module.id)} module. ${blocks.errorMessage}.`);
    }
  },
  async getTransactionStatus(txId) {
    const tx = await api.get('transactions/get', {id: txId});
    if (tx.success) {
      return {
        blockNumber: tx.height,
        status: true,
      };
    } else {
      log.warn(`Failed to get Tx ${txId} in getTransactionStatus() of ${helpers.getModuleName(module.id)} module. ${tx.errorMessage}.`);
    }
  },
  async send(params) {
    const {address, value, comment} = params;
    const payment = await api.sendMessageWithLog(config.passPhrase, address, comment, 'basic', value);
    if (payment.success) {
      log.log(`Successfully sent ${value} ADM to ${address} with comment '${comment}', Tx hash: ${payment.data.transactionId}.`);
      return {
        success: payment.data.success,
        hash: payment.data.transactionId,
      };
    } else {
      log.warn(`Failed to send ${value} ADM to ${address} with comment ${comment} in send() of ${helpers.getModuleName(module.id)} module. ${payment.errorMessage}.`);
      return {
        success: false,
        error: payment.errorMessage,
      };
    }
  },
  async updateBalance() {
    const account = await api.get('accounts', {address: config.address});
    if (account.success) {
      User.balance = account.data.account.balance / SAT;
    } else {
      log.warn(`Failed to get account info in updateBalance() of ${helpers.getModuleName(module.id)} module. ${account.errorMessage}.`);
    }
  },
};
