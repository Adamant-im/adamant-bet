const api = require('../../modules/api');
const config = require('../../modules/configReader');
const eth_utils = require('./eth_utils');
const adm_utils = require('./adm_utils');
const log = require('../log');
const db = require('../../modules/DB');
const Store = require('../../modules/Store');
const helpers = require('../utils');

module.exports = {
  thousandSeparator(num, doBold) {
    const parts = (num + '').split('.');
    const integerPart = parts[0];
    const len = integerPart.length;
    let output = '';
    let i = len - 1;

    while (i >= 0) {
      output = integerPart.charAt(i) + output;
      if ((len - i) % 3 === 0 && i > 0) {
        output = ' ' + output;
      }
      --i;
    }

    if (parts.length > 1) {
      if (doBold) {
        output = `**${output}**.${parts[1]}`;
      } else {
        output = `${output}.${parts[1]}`;
      }
    }
    return output;
  },
  async getAddressCryptoFromKVS(coin, admAddress) {
    try {
      const kvsRecords = await api.get('states/get', {senderId: admAddress, key: coin.toLowerCase() + ':address', orderBy: 'timestamp:desc'});
      if (kvsRecords.success) {
        if (kvsRecords.data.transactions.length) {
          return kvsRecords.data.transactions[0].asset.state.value;
        } else {
          return 'none';
        }
      } else {
        log.warn(`Failed to get ${coin} address for ${admAddress} from KVS in getAddressCryptoFromAdmAddressADM() of ${helpers.getModuleName(module.id)} module. ${kvsRecords.errorMessage}.`);
      }
    } catch (e) {
      log.error(`Error in getAddressCryptoFromAdmAddressADM() of ${helpers.getModuleName(module.id)} module: ${e}`);
    }
  },
  async userDailiValue(senderId) {
    return (await db.PaymentsDb.find({
      transactionIsValid: true,
      senderId: senderId,
      needToSendBack: false,
      inAmountMessageUsd: {$ne: null},
      date: {$gt: (this.unix() - 24 * 3600 * 1000)}, // last 24h
    })).reduce((r, c) => {
      return r + c.inAmountMessageUsd;
    }, 0);
  },
  async updateAllBalances() {
    await this.ETH.updateBalance();
    await this.ADM.updateBalance();
  },
  isKnown(coin) {
    return config.known_crypto.includes(coin);
  },
  isAccepted(coin) {
    return config.accepted_crypto.includes(coin);
  },
  isFiat(coin) {
    return ['USD', 'RUB', 'EUR', 'CNY', 'JPY'].includes(coin);
  },
  isHasTicker(coin) {
    const pairs = Object.keys(Store.currencies).toString();
    return pairs.includes(',' + coin + '/') || pairs.includes('/' + coin);
  },

  ETH: eth_utils,
  ADM: adm_utils,
};

module.exports.updateAllBalances();
