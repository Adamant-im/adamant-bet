const log = require('../helpers/log');
const config = require('./configReader');
const api = require('adamant-api')({node: config.node_ADM, logLevel: config.log_level}, log);

api.sendMessageWithLog = async (passPhrase, addressOrPublicKey, message, messageType = 'basic', amount, isAmountInADM = true, maxRetries = 4, retryNo = 0) => {
  return api.sendMessage(passPhrase, addressOrPublicKey, message, messageType, amount, isAmountInADM, maxRetries, retryNo).then((response) => {
    if (!response.success) {
      log.warn(`Failed to send ADM message '${message}' to ${addressOrPublicKey}. ${response.errorMessage}.`);
    }
    return response;
  });
};

module.exports = api;
