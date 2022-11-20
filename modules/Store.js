const db = require('./DB');
const log = require('../helpers/log');
const keys = require('adamant-api/src/helpers/keys');
const api = require('./api');
const axios = require('axios');
const helpers = require('../helpers/utils');
const {version} = require('../package.json');
const config = require('./configReader');

// ADM data
const AdmKeysPair = keys.createKeypairFromPassPhrase(config.passPhrase);
const AdmAddress = keys.createAddressFromPublicKey(AdmKeysPair.publicKey);
// ETH data
const ethData = api.eth.keys(config.passPhrase);
// LSK data
const lskData = api.lsk.keys(config.passPhrase);

module.exports = {
  version,
  round: null,
  botName: AdmAddress,

  user: {
    ADM: {
      passPhrase: config.passPhrase,
      keysPair: AdmKeysPair,
      address: AdmAddress,
    },
    ETH: {
      address: ethData.address,
      privateKey: ethData.privateKey,
    },
    LSK: {
      address: lskData.address,
      privateKey: lskData.privateKey,
    },
  },

  fees: {
    DOGE: 1,
    LSK: 0.1,
    DASH: 0.0001,
    ADM: 0.5,
    ETH: 0.0001, // This is a stub. Ether fee returned with FEE() method in separate module
  },

  lastBlock: null,
  get lastHeight() {
    return this.lastBlock && this.lastBlock.height || false;
  },

  updateSystem(field, data) {
    const $set = {};
    $set[field] = data;
    db.SystemDb.db.updateOne({}, {$set}, {upsert: true});
    this[field] = data;
  },

  async updateLastBlock() {
    try {
      const blocks = await api.get('blocks', {limit: 1});
      if (blocks?.success) {
        this.updateSystem('lastBlock', blocks.data.blocks[0]);
      } else {
        log.warn(`Failed to get last block in updateLastBlock() of ${helpers.getModuleName(module.id)} module. ${blocks?.errorMessage}.`);
      }
    } catch (e) {
      log.error(`Error in updateLastBlock() of ${helpers.getModuleName(module.id)} module: ${e}`);
    }
  },

  async updateCurrencies() {
    const url = config.infoservice + '/get';
    try {
      const res = await axios.get(url, {});
      if (res) {
        const data = res?.data?.result;
        if (data) {
          this.currencies = data;
        } else {
          log.warn(`Error in updateCurrencies() of ${helpers.getModuleName(module.id)} module: Request to ${url} returned empty result.`);
        }
      }
    } catch (error) {
      log.warn(`Error in updateCurrencies() of ${helpers.getModuleName(module.id)} module: Request to ${url} failed with ${error?.response?.status} status code, ${error.toString()}${error?.response?.data ? '. Message: ' + error.response.data.toString().trim() : ''}.`);
    }
  },

  getPrice(from, to) {
    try {
      from = from.toUpperCase();
      to = to.toUpperCase();
      const price = +(this.currencies[from + '/' + to] || 1 / this.currencies[to + '/' + from] || 0).toFixed(8);
      if (price) {
        return price;
      }
      const priceFrom = +(this.currencies[from + '/USD']);
      const priceTo = +(this.currencies[to + '/USD']);
      return +(priceFrom / priceTo || 1).toFixed(8);
    } catch (e) {
      log.error('Error while calculating getPrice(): ' + e);
      return 0;
    }
  },

  cryptoConvert(from, to, amount, doNotAccountFees = true) {
    try {
      let price = this.getPrice(from, to);
      if (!doNotAccountFees) {
        price *= (100 - config['exchange_fee_' + from]) / 100;
      }
      if (!price) {
        return {
          outAmount: 0,
          exchangePrice: 0,
        };
      }
      price = +price.toFixed(8);
      return {
        outAmount: +(price * amount).toFixed(8),
        exchangePrice: price,
      };
    } catch (e) {
      log.error(`Error in cryptoConvert() of ${helpers.getModuleName(module.id)} module: ${e}`);
    }
  },
};

config.notifyName = `${config.bot_name} (${module.exports.botName})`;
module.exports.updateCurrencies();

setInterval(() => {
  module.exports.updateCurrencies();
}, 60 * 1000);

