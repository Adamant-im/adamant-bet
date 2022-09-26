const request = require('request');
const moment = require('moment');
const config = require('../modules/configReader');
const log = require('./log');

module.exports = {
  async getFullURL(url, options) {
    const params = [];
    for (const key of options) {
      params.push(`${key}=${options[key]}`);
    }
    return url + '?' + params.join('&');
  },

  async getFreshCryptoRate(currency, UtcDate) {
    const baseURL = 'https://min-api.cryptocompare.com/data/histominute';
    const apiKey = config.cryptocompareApiKey;

    const options = {
      api_key: apiKey,
      fsym: currency,
      tsym: 'USD',
      toTs: UtcDate,
      limit: 1,
    };

    const fullURL = await this.getFullURL(baseURL, options);
    const UtcDateString = moment(UtcDate).format('YYYY/MM/DD HH:mm Z');

    let rate = false;

    return new Promise((resolve) => {
      request.get(fullURL, function(err, res, body) {
        if (err) {
          log.warn(`Unable to get crypto rate on ${UtcDateString}: ${err}.`);
          resolve(false);
        } else {
          const result = JSON.parse(body);
          if (result && result.Response === 'Success') {
            log.info(`Got crypto rate successfully on ${UtcDateString}: ${body}.`);
            rate = result.Data[1].close;
            if (!rate) {
              rate = result.Data[0].close;
            }
            log.info(`${currency} rate at ${UtcDateString} is ${rate}.`);
            resolve(rate);
          } else {
            log.warn(`Unable to get crypto rate on ${UtcDateString}: ${body}.`);
            resolve(false);
          }
        }
      });
    });
  },

};
