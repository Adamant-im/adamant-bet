const constants = require('./const');
const log = require('./log');

module.exports = {
  /**
   * Returns current time in milliseconds since Unix Epoch
   * @return {number}
   */
  unix() {
    return new Date().getTime();
  },

  /**
   * Returns module name from its ID
   * @param {string} id Module name, module.id
   * @return {string}
   */
  getModuleName(id) {
    try {
      let n = id.lastIndexOf('\\');
      if (n === -1) {
        n = id.lastIndexOf('/');
      }
      if (n === -1) {
        return '';
      } else {
        return id.substring(n + 1);
      }
    } catch (e) {
      log.error(`Error in getModuleName() of utils.js module: ${e}`);
    }
  },

  /**
   * Converts ADAMANT's epoch timestamp to a Unix timestamp
   * @param {number} epochTime Timestamp to convert
   * @return {number}
   */
  toTimestamp(epochTime) {
    return epochTime * 1000 + constants.EPOCH;
  },

  timeDiffDaysHoursMins(dateNext, datePrev) {
    let timeString = '';
    const days = this.timeDiff(dateNext + 1000, datePrev, 'days');
    const hours = this.timeDiff(dateNext + 1000, datePrev, 'hours') % 24;
    const mins = this.timeDiff(dateNext + 1000, datePrev, 'minutes') % 60;

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

  timeDiff(dateNext, datePrev, interval) { // if no value for datePrev provided, suppose dateNext is timediff
    const second = 1000;
    const minute = second * 60;
    const hour = minute * 60;
    const day = hour * 24;
    const week = day * 7;
    const timediff = datePrev ? dateNext - datePrev : dateNext;
    if (isNaN(timediff)) return NaN;

    switch (interval) {
      case 'years':
        return dateNext.getFullYear() - datePrev.getFullYear();
      case 'months':
        return (
          (dateNext.getFullYear() * 12 + dateNext.getMonth()) - (datePrev.getFullYear() * 12 + datePrev.getMonth())
        );
      case 'weeks':
        return Math.floor(timediff / week);
      case 'days':
        return Math.floor(timediff / day);
      case 'hours':
        return Math.floor(timediff / hour);
      case 'minutes':
        return Math.floor(timediff / minute);
      case 'seconds':
        return Math.floor(timediff / second);
      default:
        return undefined;
    }
  },

  incline(number, one, some) {
    return number > 1 ? some : one;
  },

  thousandSeparator(num, doBold) {
    try {
      const parts = (num + '').split('.');
      const main = parts[0];
      const len = main.length;
      let output = '';
      let i = len - 1;

      while (i >= 0) {
        output = main.charAt(i) + output;
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
    } catch (e) {
      log.error(`Error in thousandSeparator() of ${this.getModuleName(module.id)} module: ${e}`);
    }
  },

  /**
   * Checks if number is finite
   * @param {number} value Number to validate
   * @return {boolean}
   */
  isNumber(value) {
    if (typeof (value) !== 'number' || isNaN(value) || !Number.isFinite(value)) {
      return false;
    }
    return true;
  },

  /**
   * Checks if number is finite and not less, than 0
   * @param {number} value Number to validate
   * @return {boolean}
   */
  isPositiveOrZeroNumber(value) {
    if (!this.isNumber(value) || value < 0) {
      return false;
    }
    return true;
  },

  /**
   * Converts a bytes array to the respective string representation
   * @param {Array<number>|Uint8Array} bytes bytes array
   * @return {string}
   */
  bytesToHex(bytes = []) {
    const hex = [];
    bytes.forEach((b) => hex.push(
        (b >>> 4).toString(16),
        (b & 0xF).toString(16),
    ));
    return hex.join('');
  },
  /**
   * Compares two strings, case-insensitive
   * @param {string} string1
   * @param {string} string2
   * @return {boolean} True, if strings are equal, case-insensitive
   */
  isStringEqualCI(string1, string2) {
    if (typeof string1 !== 'string' || typeof string2 !== 'string') return false;
    return string1.toUpperCase() === string2.toUpperCase();
  },
  /**
   * Formats unix timestamp to string
   * @param {number} timestamp Timestamp to format
   * @return {object} Contains different formatted strings
   */
  formatDate(timestamp) {
    if (!timestamp) {
      return false;
    }
    const formattedDate = {};
    const dateObject = new Date(timestamp);
    formattedDate.year = dateObject.getFullYear();
    formattedDate.month = ('0' + (dateObject.getMonth() + 1)).slice(-2);
    formattedDate.date = ('0' + dateObject.getDate()).slice(-2);
    formattedDate.hours = ('0' + dateObject.getHours()).slice(-2);
    formattedDate.minutes = ('0' + dateObject.getMinutes()).slice(-2);
    formattedDate.seconds = ('0' + dateObject.getSeconds()).slice(-2);
    formattedDate.YYYY_MM_DD = formattedDate.year + '-' + formattedDate.month + '-' + formattedDate.date;
    formattedDate.YYYY_MM_DD_hh_mm = formattedDate.year + '-' + formattedDate.month + '-' + formattedDate.date + ' ' + formattedDate.hours + ':' + formattedDate.minutes;
    formattedDate.hh_mm_ss = formattedDate.hours + ':' + formattedDate.minutes + ':' + formattedDate.seconds;
    return formattedDate;
  },
};
