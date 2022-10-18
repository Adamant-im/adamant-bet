const Store = require('./Store');
const api = require('./api');
const txParser = require('./incomingTxsParser');
const log = require('../helpers/log');

// const $u = require('../helpers/utils');

async function check() {
  try {
    if (!Store.lastHeight) {
      return;
    }

    // console.log('333Cron next time run: ' + Task.betsJob.nextDates());
    // console.log('444Cron next time run: ' + Task.ifCoolPeriod(Date.now()));
    // $u.ifCoolPeriod(Date.now());

    const txChat = (await api.get('uri', 'chats/get/?recipientId=' + Store.user.ADM.address + '&orderBy=timestamp:desc&fromHeight=' + (Store.lastHeight - 5))).transactions;

    const txTrx = (await api.get('transactions', 'fromHeight=' + (Store.lastHeight - 5) + '&and:recipientId=' + Store.user.ADM.address + '&and:type=0')).transactions;

    txChat
        .concat(txTrx)
        .forEach((t) => {
          txParser(t);
        });
    Store.updateLastBlock();
  } catch (e) {
    log.error('Error while checking new transactions: ' + e);
  }
}
module.exports = () => {
  setInterval(check, 1500);
};
