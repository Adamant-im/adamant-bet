const api = require('../../modules/api');
const config = require('../../modules/configReader');
const eth_utils = require('./eth_utils');
const adm_utils = require('./adm_utils');
const LskCoin = require('./lsk_utils');
const log = require('../log');
const db = require('../../modules/DB');
const Store = require('../../modules/Store');
const helpers = require('../utils');

module.exports = {
  /**
   * Get coin address from KVS for ADM account
   * @param {String} coin Like ETH
   * @param {String} admAddress Account to get coin address for
   * @return {Promise<*>} Address like '0x5f625681dA71e83C6f8aCef0299a6ab16539f54E' or 'none'
   */
  async getAddressCryptoFromAdmAddressADM(coin, admAddress) {
    try {
      const kvsRecords = await api.get('states/get', {senderId: admAddress, key: coin.toLowerCase() + ':address', orderBy: 'timestamp:desc'});
      if (kvsRecords?.success) {
        if (kvsRecords.data.transactions.length) {
          return kvsRecords.data.transactions[0].asset.state.value;
        } else {
          return 'none';
        }
      } else {
        log.warn(`Failed to get ${coin} address for ${admAddress} from KVS in getAddressCryptoFromAdmAddressADM() of ${helpers.getModuleName(module.id)} module. ${kvsRecords?.errorMessage}.`);
      }
    } catch (e) {
      log.error(`Error in getAddressCryptoFromAdmAddressADM() of ${helpers.getModuleName(module.id)} module: ${e}`);
    }
  },

  async userDailyValue(senderId) {
    return (await db.PaymentsDb.find({
      transactionIsValid: true,
      senderId: senderId,
      needToSendBack: false,
      inAmountMessageUsd: {$ne: null},
      date: {$gt: (helpers.unix() - 24 * 3600 * 1000)}, // last 24h
    })).reduce((r, c) => {
      return r + c.inAmountMessageUsd;
    }, 0);
  },

  /**
   * Update all coin balances
   * @return {Promise<void>}
   */
  async updateAllBalances() {
    try {
      await this.ETH.updateBalance();
      await this.ADM.updateBalance();
      await this.LSK.updateBalance();
    } catch (e) {
      log.error(`Error in updateAllBalances() of ${helpers.getModuleName(module.id)} module: ${e}`);
    }
  },

  /**
   * Get last block numbers for all coins
   * @return {Promise<Object>}
   */
  async getLastBlocksNumbers() {
    try {
      const data = {
        ETH: await this.ETH.getLastBlock(),
        ADM: await this.ADM.getLastBlock(),
        LSK: await this.LSK.getLastBlockHeight(),
      };
      return data;
    } catch (e) {
      log.error(`Error in getLastBlocksNumbers() of ${helpers.getModuleName(module.id)} module: ${e}`);
    }
  },

  /**
   * Returns true if coin is in known_crypto list in config
   * @param {String} coin
   * @return {Boolean}
   */
  isKnown(coin) {
    return config.known_crypto.includes(coin);
  },
  /**
   * Returns true if coin is in accepted_crypto list in config
   * @param {String} coin
   * @return {Boolean}
   */
  isAccepted(coin) {
    return config.accepted_crypto.includes(coin);
  },
  /**
   * Returns true if coin is fiat money
   * @param {String} coin
   * @return {Boolean}
   */
  isFiat(coin) {
    return ['USD', 'RUB', 'EUR', 'CNY', 'JPY', 'KRW'].includes(coin);
  },
  isHasTicker(coin) { // if coin has ticker like COIN/OTHERCOIN or OTHERCOIN/COIN
    const pairs = Object.keys(Store.currencies).toString();
    return pairs.includes(',' + coin + '/') || pairs.includes('/' + coin);
  },

  ETH: eth_utils,
  ADM: adm_utils,
  LSK: new LskCoin('LSK'),
};

module.exports.updateAllBalances();
