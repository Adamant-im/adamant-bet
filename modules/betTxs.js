const api = require('./api');
const moment = require('moment');
const db = require('./DB');
const {SAT} = require('../helpers/const');
const $u = require('../helpers/cryptos');
const helpers = require('../helpers/utils');
const notify = require('../helpers/notify');
const log = require('../helpers/log');
const config = require('./configReader');
const Store = require('./Store');
const deepTxValidator = require('./deepTxValidator');
const Task = require('../helpers/CronTask');

module.exports = async (itx, tx) => {
  try {
    const {PaymentsDb} = db;
    const msg = itx.encrypted_content;
    let inCurrency;
    let betString;
    let inTxid;
    let inAmountMessage;

    if (tx.amount > 0) { // ADM income payment
      inAmountMessage = tx.amount / SAT;
      inCurrency = 'ADM';
      inTxid = tx.id;
      betString = msg;
    } else if (msg.includes('_transaction')) { // not ADM income payment
      inCurrency = msg.match(/"type":"(.*)_transaction/)[1];
      try {
        const json = JSON.parse(msg);
        inAmountMessage = Number(json.amount);
        inTxid = json.hash;
        betString = json.comments;
      } catch (e) {
        inCurrency = 'none';
      }
    }

    const betRate = Number(betString);
    inCurrency = String(inCurrency).toUpperCase().trim();

    log.info(`Got a new bet: ${inAmountMessage} ${inCurrency} on ${config.bet_currency} at ${betRate} USD.`);

    const pay = new PaymentsDb({
      _id: tx.id,
      date: helpers.unix(),
      admTxId: tx.id,
      txTimestamp: tx.timestamp * 1000 + Date.UTC(2017, 8, 2, 17, 0, 0, 0),
      itxId: itx._id,
      senderId: tx.senderId,
      inCurrency,
      betRateValue: betRate,
      betRound: null,
      betRoundEndTime: null,
      betMessageText: null,
      betMessageTextNoMarkdown: null,
      inTxid,
      inAmountMessage: +(inAmountMessage).toFixed(8),
      transactionIsValid: null,
      needHumanCheck: false,
      needToSendBack: false,
      transactionIsFailed: false,
      transactionIsConfirmed: false,
      isFinished: false,
      isBetsRequest: false,
      isKVSnotFoundNotified: false,
    });

    // Validate
    let msgSendBack = false;
    let msgNotify = false;
    let notifyType = 'info';
    const min_value_usd = config.min_value_usd;
    const min_confirmations = config['min_confirmations_' + inCurrency];
    const inTxidDuplicate = await PaymentsDb.findOne({inTxid});

    // Checkers
    if (inTxidDuplicate) {
      pay.isFinished = true;
      pay.error = 1;
      notifyType = 'error';
      msgNotify = `${config.notifyName} thinks transaction of _${inAmountMessage}_ _${inCurrency}_ is duplicated. Tx hash: _${inTxid}_. Will ignore this transaction. Income ADAMANT Tx: https://explorer.adamant.im/tx/${tx.id}.`;
      msgSendBack = `I think transaction of _${inAmountMessage}_ _${inCurrency}_ with Tx ID _${inTxid}_ is duplicated, it will not be processed. If you think it’s a mistake, contact my master.`;
    } else if (!$u.isKnown(inCurrency)) {
      pay.error = 2;
      pay.needHumanCheck = true;
      pay.isFinished = true;
      notifyType = 'error';
      msgNotify = `Bet Bot ${Store.botName} notifies about incoming transfer of unknown crypto: _${inAmountMessage}_ _${inCurrency}_. Attention needed. Income ADAMANT Tx: https://explorer.adamant.im/tx/${tx.id}.`;
      msgSendBack = `I don’t know crypto _${inCurrency}_. If you think it’s a mistake, contact my master.`;
    } else if (!$u.isAccepted(inCurrency)) {
      pay.error = 5;
      pay.needToSendBack = true;
      notifyType = 'warn';

      msgNotify = `${config.notifyName} notifies about incoming transfer of unaccepted crypto: _${inAmountMessage}_ _${inCurrency}_. Will try to send payment back. Income ADAMANT Tx: https://explorer.adamant.im/tx/${tx.id}.`;
      msgSendBack = `Crypto _${inCurrency}_ is not accepted. I will try to send transfer back to you. I will validate it and wait for _${min_confirmations}_ block confirmations. It can take a time, please be patient.`;
    } else if (!betRate) {
      pay.error = 93;
      pay.needToSendBack = true;
      notifyType = 'warn';

      msgNotify = `${config.notifyName} cannot recognize user bet. Got _${betRate}_ from string _${betString}_. Will try to send payment of _${inAmountMessage}_ _${inCurrency}_ back. Income ADAMANT Tx: https://explorer.adamant.im/tx/${tx.id}.`;
      msgSendBack = `I can't recognize bet from your comment _${betString}_. Please put a number. I will try to send transfer back to you. I will validate it and wait for _${min_confirmations}_ block confirmations. It can take a time, please be patient.`;
    } else {
      // Calculate transaction value
      pay.inAmountMessageUsd = Store.cryptoConvert(inCurrency, 'USD', inAmountMessage).outAmount;
      const userDailyValue = await $u.userDailyValue(tx.senderId);
      log.log(`User's ${tx.senderId} daily volume is ${userDailyValue} USD. Transaction value is ${pay.inAmountMessageUsd} USD.`);
      if (userDailyValue + pay.inAmountMessageUsd >= config.daily_limit_usd) {
        pay.update({
          error: 23,
          needToSendBack: true,
        });
        notifyType = 'warn';

        msgNotify = `${config.notifyName} notifies that user _${tx.senderId}_ exceeds daily limit of _${config.daily_limit_usd}_ USD with transfer of _${inAmountMessage} ${inCurrency}_. Will try to send payment back. Income ADAMANT Tx: https://explorer.adamant.im/tx/${tx.id}.`;
        msgSendBack = `You have exceeded maximum daily volume of _${config.daily_limit_usd}_ USD. I will try to send transfer back to you. I will validate it and wait for _${min_confirmations}_ block confirmations. It can take a time, please be patient.`;
      } else if (!pay.inAmountMessageUsd || pay.inAmountMessageUsd < min_value_usd) {
        pay.update({
          error: 20,
          needToSendBack: true,
        });
        notifyType = 'warn';
        msgNotify = `${config.notifyName} notifies about incoming transaction below minimum value of _${min_value_usd}_ USD: _${inAmountMessage}_ _${inCurrency}_. Will try to send payment back. Income ADAMANT Tx: https://explorer.adamant.im/tx/${tx.id}.`;
        msgSendBack = `I don’t accept bets below minimum value of _${min_value_usd}_ USD. I will try to send transfer back to you. I will validate it and wait for _${min_confirmations}_ block confirmations. It can take a time, please be patient.`;
      }
    }

    if (!pay.isFinished && !pay.needToSendBack) {
      notifyType = 'log';
      const isCoolPeriod = Task.ifCoolPeriod(pay.txTimestamp);
      const roundTime = Task.getRoundTime();
      let leftTime;

      let periodString = ``;
      let betRound;
      let betRoundEndTime;
      if (isCoolPeriod) {
        betRound = Store.round + 1;
        betRoundEndTime = +Task.betsJob.nextDates(2)[1];
        periodString = ` **Note: bet is accepted not for current, but for next round; cool period goes now.**`;
        leftTime = roundTime;
      } else {
        betRound = Store.round;
        betRoundEndTime = +Task.betsJob.nextDates();
        periodString = ``;
        leftTime = Task.getTimeLeft(pay.txTimestamp);
      }

      const betMessageText = `_${helpers.thousandSeparator(inAmountMessage, false)}_ _${inCurrency}_ (**${helpers.thousandSeparator(pay.inAmountMessageUsd.toFixed(2), false)} USD**) on _${helpers.thousandSeparator(betRate, false)}_ USD for _${config.bet_currency}_ at ${moment(betRoundEndTime).format('YYYY/MM/DD HH:mm Z')} (round _${betRound}_)`;
      const betMessageTextNoMarkdown = `${inAmountMessage} ${inCurrency} (${pay.inAmountMessageUsd.toFixed(2)} USD) on ${betRate} USD for ${config.bet_currency} at ${moment(betRoundEndTime).format('YYYY/MM/DD HH:mm Z')} (round ${betRound})`;
      const earlyBetKoef = 2 - (roundTime - leftTime) / roundTime;

      let roundInfo = `Current round ${Store.round} duration: ${helpers.timeDiffDaysHoursMins(roundTime)}, it ends on ${Task.getBetDateString('current').nextRoundTime}.`;
      roundInfo += ` Cool period is ${config.cool_period_hours} hours.`;
      roundInfo += ` Time left until next round: ${helpers.timeDiffDaysHoursMins(leftTime)}.`;
      if (isCoolPeriod) {
        roundInfo += ` **The bet is placed in cool period for current round**.`;
      }
      roundInfo += ` Early bet koef: ${earlyBetKoef.toFixed(2)}.`;
      log.log(roundInfo);

      pay.update({
        betMessageText,
        betMessageTextNoMarkdown,
        earlyBetKoef,
        betRound,
      });

      msgNotify = `${config.notifyName} notifies about incoming bet of ${betMessageText} from ${tx.senderId}.${periodString} Tx hash: _${inTxid}_. Income ADAMANT Tx: https://explorer.adamant.im/tx/${tx.id}.`;
      msgSendBack = `I understood your bet of ${betMessageText}.${periodString} Now I will validate your transfer and wait for _${min_confirmations}_ block confirmations. It can take a time, please be patient.`;
    }

    await pay.save();
    await itx.update({isProcessed: true}, true);

    notify(msgNotify, notifyType);
    await api.sendMessageWithLog(config.passPhrase, tx.senderId, msgSendBack);

    if (!pay.isFinished) {
      deepTxValidator(pay, tx);
    }
  } catch (e) {
    log.error(`Error in ${helpers.getModuleName(module.id)} module: ${e}`);
  }
};


