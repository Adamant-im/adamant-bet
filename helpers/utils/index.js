const api = require('../../modules/api');
const config = require('../../modules/configReader');
const eth_utils = require('./eth_utils');
const adm_utils = require('./adm_utils');
const log = require('../log');
const db = require('../../modules/DB');
const Store = require('../../modules/Store');

module.exports = {
  unix() {
    return new Date().getTime();
  },
  sendAdmMsg(address, msg, type = 'message') {
    if (msg && !config.isDev) {
      try {
        const msg_markdown = msg.replace(/[^*]\*[^*]/g, '**');
        return api.send(config.passPhrase, address, msg_markdown, type).success || false;
      } catch (e) {
        return false;
      }
    }
  },
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
      const resp = await api.syncGet(`/api/states/get?senderId=${admAddress}&key=${coin.toLowerCase()}:address`);
      // console.log('getAddressCryptoFromKVS(): ' + `/api/states/get?senderId=${admAddress}&key=${coin.toLowerCase()}:address`);
      if (resp && resp.success) {
        if (resp.transactions.length) {
          return resp.transactions[0].asset.state.value;
        } else {
          return 'none';
        }
      }
    } catch (e) {
      log.error('Error in getAddressCryptoFromKVS(): ' + e);
      return null;
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
  timeDiff(dateNext, datePrev, interval) { // if no value for datePrev provided, suppose dateNext is timediff
    const second=1000; const minute=second*60; const hour=minute*60; const day=hour*24; const week=day*7;
    const timediff = datePrev ? dateNext - datePrev : dateNext;
    if (isNaN(timediff)) return NaN;

    switch (interval) {
      case 'years': return dateNext.getFullYear() - datePrev.getFullYear();
      case 'months': return (
        (dateNext.getFullYear() * 12 + dateNext.getMonth()) - (datePrev.getFullYear() * 12 + datePrev.getMonth())
      );
      case 'weeks': return Math.floor(timediff / week);
      case 'days': return Math.floor(timediff / day);
      case 'hours': return Math.floor(timediff / hour);
      case 'minutes': return Math.floor(timediff / minute);
      case 'seconds': return Math.floor(timediff / second);
      default: return undefined;
    }
  },
  incline(number, one, some) {
    return number > 1 ? some: one;
  },
  timeDiffDaysHoursMins(dateNext, datePrev) {
    let timeString = '';
    const days = this.timeDiff(dateNext +1000, datePrev, 'days');
    const hours = this.timeDiff(dateNext +1000, datePrev, 'hours') % 24;
    const mins = this.timeDiff(dateNext +1000, datePrev, 'minutes') % 60;

    if (days > 0) {
      timeString = timeString + days + ' ' + this.incline(days, 'day', 'days');
    }
    if ((days < 7) && (hours > 0)) {
      timeString = timeString + ' ' + hours + ' ' + this.incline(hours, 'hour', 'hours');
    }
    if ((days === 0) && (mins > 0)) {
      timeString = timeString + ' ' + mins + ' ' + this.incline(mins, 'min', 'mins');
    }
    timeString = timeString.trim();
    if (timeString === '') {
      timeString = '~0';
    }

    return timeString;
  },
  ETH: eth_utils,
  ADM: adm_utils,
};

module.exports.updateAllBalances();
