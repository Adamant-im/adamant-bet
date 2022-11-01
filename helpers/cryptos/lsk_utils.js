const config = require('../../modules/configReader');
const log = require('../log');
const transactions = require('@liskhq/lisk-transactions');
const cryptography = require('@liskhq/lisk-cryptography');

const LskBaseCoin = require('./lskBaseCoin');
const helpers = require('../utils');
const Store = require('../../modules/Store');

const lskNode = config.node_LSK[0];
const lskService = config.service_LSK[0];

module.exports = class LskCoin extends LskBaseCoin {
  constructor(token) {
    super(token);
  }

  get networkIdentifier() {
    // Testnet: '15f0dacc1060e91818224a94286b13aa04279c640bd5d6f193182031d133df7c'
    // Mainnet: '4c09e6a781fc4c7bdb936ee815de8f94190f8a7519becd9de2081832be309a99'
    const networkIdentifier = '4c09e6a781fc4c7bdb936ee815de8f94190f8a7519becd9de2081832be309a99';
    return Buffer.from(networkIdentifier, 'hex');
  }

  getHeight() {
    return this._get(`${lskNode}/api/node/info`, {})
        .then((data) => Number(data.data.height) || 0)
        .catch((e) => {
          log.warn(`Error while getting Lisk height in getHeight() of ${helpers.getModuleName(module.id)} module: ` + e);
        });
  }

  /**
   * Returns last block of LSK blockchain from cache, if it's up to date.
   * If not, makes an API request and updates cached data.
   * Used only for this.getLastBlockHeight()
   * @override
   * @return {Object} or undefined, if unable to get block info
   */
  async getLastBlock() {
    const cached = this.cache.getData('lastBlock', true);
    if (cached) {
      return cached;
    }
    const height = await this.getHeight();
    if (height) {
      this.cache.cacheData('lastBlock', height);
      return height;
    } else {
      log.warn(`Failed to get last block in getLastBlock() of ${helpers.getModuleName(module.id)} module. Received value: `);
    }
  }

  /**
   * Returns last block height of LSK blockchain
   * @override
   * @return {Promise<Number>} or undefined, if unable to get block info
   */
  async getLastBlockHeight() {
    const block = await this.getLastBlock();
    return block || undefined;
  }

  /**
   * Returns balance in LSK from cache, if it's up to date. If not, makes an API request and updates cached data.
   * @override
   * @return {Promise<Number>} or outdated cached value, if unable to fetch data; it may be undefined also
   */
  async updateBalance() {
    try {
      const cached = this.cache.getData('balance', true);
      if (cached) { // balance is a beddows string or number
        return this.fromBeddows(cached);
      }
      const result = await this._get(`${lskNode}/api/accounts/${this.account.addressHex}`, {});
      if (result?.errors?.[0].message?.includes('was not found')) {
        result.data = {
          token: {
            balance: 0,
          },
        };
      }
      if (result && result.data && (result.data.token.balance !== undefined)) {
        const {balance} = result.data.token;
        this.cache.cacheData('balance', balance);
        Store.user.LSK.balance = this.fromBeddows(balance);
        return this.fromBeddows(balance);
      } else {
        const balanceErrorMessage = result?.errors?.[0].message ? ' ' + result.errors[0].message : '';
        log.warn(`Failed to get balance in getBalance() for ${this.token} of ${helpers.getModuleName(module.id)} module; returning outdated cached balance.${balanceErrorMessage}`);
        return this.fromBeddows(this.cache.getData('balance', false));
      }
    } catch (e) {
      log.warn(`Error while getting balance in getBalance() for ${this.token} of ${helpers.getModuleName(module.id)} module: ` + e);
    }
  }

  /**
   * Send signed transaction to blockchain network
   * @override
   * @param {Object} signedTx
   * @return {Promise<Number>}
   */
  sendTransaction(signedTx) {
    return this._getClient().post('/api/transactions', signedTx).then((response) => {
      return response.data.data.transactionId;
    }).catch((e) => {
      log.warn(`Error while sending transaction in sendTransaction() of ${helpers.getModuleName(module.id)} module: ` + e);
    });
  }

  /**
   * Build Tx and broadcasts it
   * @override
   * @param {object} params try: try number, address: recipient's address, value: amount to send in coins (not beddows)
   */
  async send(params) {
    let fee = this.FEE;
    try {
      const account = await this._get(`${lskNode}/api/accounts/${this.account.addressHex}`, {});
      const nonce = Number(account.data.sequence.nonce);
      fee = this._buildTransaction(params.address, params.value, fee, nonce).minFee;
      const result = await this.createTransaction(params.address, params.value, fee, nonce);
      try {
        if (result) {
          log.log(`Successfully built Tx ${result.txId} to send ${params.value} ${this.token} to ${params.address} with ${fee} ${this.token} fee.`);
          const hash = await this.sendTransaction(result.tx);
          try {
            if (hash) {
              log.log(`Successfully broadcast Tx to send ${params.value} ${this.token} to ${params.address} with ${fee} ${this.token} fee, Tx hash: ${hash}.`);
              return {
                success: true,
                hash,
              };
            }
            return {
              success: false,
              error: `Unable to broadcast Tx, it may be dust amount or other error`,
            };
          } catch (e) {
            return {
              success: false,
              error: e.toString(),
            };
          }
        }
        return {
          success: false,
          error: `Unable to create Tx`,
        };
      } catch (e) {
        return {
          success: false,
          error: e.toString(),
        };
      }
    } catch (e) {
      log.warn(`Error while sending ${params.value} ${this.token} to ${params.address} with ${fee} ${this.token} fee in send() of ${helpers.getModuleName(module.id)} module: ` + e);
      return {
        success: false, error: e.toString(),
      };
    }
  }

  /**
   * Creates a signed tx object and ID
   * Signed JSON tx object is ready for broadcasting to blockchain network
   * @override
   * @param {String} address receiver address in Base32 format
   * @param {Number} amount amount to transfer (coins, not beddows)
   * @param {Number} fee transaction fee (coins, not beddows)
   * @param {Number} nonce transaction nonce
   * @param {String} data
   * @return {Promise<{tx: Object, txId: string}>}
   */
  createTransaction(address = '', amount = 0, fee, nonce, data = '') {
    const {liskTx} = this._buildTransaction(address, amount, fee, nonce, data);
    // To use transactions.signTransaction, passPhrase is necessary
    // So we'll use cryptography.signDataWithPrivateKey
    const liskTxBytes = transactions.getSigningBytes(this.assetSchema, liskTx);
    const txSignature = cryptography.signDataWithPrivateKey(
        Buffer.concat([this.networkIdentifier, liskTxBytes]), this.account.keyPair.secretKey,
    );

    liskTx.signatures[0] = txSignature;
    const txId = helpers.bytesToHex(cryptography.hash(transactions.getBytes(this.assetSchema, liskTx)));

    // To send Tx to node's core API, we should change data types
    liskTx.senderPublicKey = helpers.bytesToHex(liskTx.senderPublicKey);
    liskTx.nonce = nonce.toString();
    liskTx.fee = transactions.convertLSKToBeddows((+fee).toFixed(this.decimals));
    liskTx.asset.amount = transactions.convertLSKToBeddows((+amount).toFixed(this.decimals));
    liskTx.asset.recipientAddress = helpers.bytesToHex(liskTx.asset.recipientAddress);
    liskTx.signatures[0] = helpers.bytesToHex(txSignature);
    return Promise.resolve({tx: liskTx, txId});
  }

  /**
   * Returns Tx status and block height
   * @override
   * @param {String} txId Tx ID to fetch
   * @param {Boolean} disableLogging Disable logging flag
   * @return {Object} Formed tx
   */
  async getTransactionStatus(txId, disableLogging = false) {
    return this._getService(`${lskService}/api/v2/transactions/`, {transactionId: txId}).then((result) => {
      if (typeof result === 'object' && result.data[0]) {
        const formedTx = this._mapTransaction(result.data[0]);
        if (!disableLogging) log.log(`${this.token} tx status: ${this.formTxMessage(formedTx)}.`);
        return {
          blockNumber: formedTx.height,
          status: true,
        };
      }
    }).catch((e) => {
      log.warn(`Error while getting transaction status in getTransactionStatus() for ${txId} of ${helpers.getModuleName(module.id)} module: ` + e);
    });
  }
  /**
   * Returns tx
   * @override
   * @param {String} txId Tx ID to fetch
   * @param {Boolean} disableLogging Disable logging flag
   * @return {Object} Formed tx
   */
  async getTransaction(txId, disableLogging = false) {
    return this._getService(`${lskService}/api/v2/transactions/`, {transactionId: txId}).then((result) => {
      if (typeof result === 'object' && result.data[0]) {
        const formedTx = this._mapTransaction(result.data[0]);
        if (!disableLogging) log.log(`${this.token} tx status: ${this.formTxMessage(formedTx)}.`);
        return {
          blockNumber: formedTx.height,
          hash: formedTx.id,
          sender: formedTx.senderId,
          recipient: formedTx.recipientId,
          amount: +(formedTx.amount).toFixed(8),
        };
      }
    }).catch((e) => {
      log.warn(`Error while getting transaction status in getTransaction() for ${txId} of ${helpers.getModuleName(module.id)} module: ` + e);
    });
  }
};
