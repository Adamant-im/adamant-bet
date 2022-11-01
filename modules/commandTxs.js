const api = require('./api');
const Store = require('../modules/Store');
const helpers = require('../helpers/utils');
const $u = require('../helpers/cryptos');
const notify = require('../helpers/notify');
const config = require('./configReader');
const log = require('../helpers/log');

module.exports = async (cmd, tx, itx) => {
  log.info('Got new Command Tx to process: ' + cmd);
  try {
    let res = {};
    const group = cmd
        .trim()
        .replace(/ {4}/g, ' ')
        .replace(/ {3}/g, ' ')
        .replace(/ {2}/g, ' ')
        .split(' ');
    const methodName = group.shift().trim().toLowerCase().replace('/', '');
    const m = commands[methodName];
    if (m) {
      res = await m(group, tx);
    } else {
      res.msgSendBack = `I don’t know _/${methodName}_ command. ℹ️ You can start with **/help**.`;
    }
    if (!tx) {
      return res.msgSendBack;
    }
    if (tx) {
      itx.update({isProcessed: true}, true);
      if (res.msgNotify) {
        notify(res.msgNotify, res.notifyType);
      }
      if (res.msgSendBack) {
        await api.sendMessageWithLog(config.passPhrase, tx.senderId, res.msgSendBack);
      }
    }
  } catch (e) {
    tx = tx || {};
    log.error('Error while processing command ' + cmd + ' from sendedId ' + tx.senderId + '. Tx Id: ' + tx.id + '. Error: ' + e);
  }
};

function help() {
  const Task = require('../helpers/CronTask');
  let str = `I am **online** and ready to accept your bets on _${config.bet_currency}_ rate. I accept and pay rewards in _${config.accepted_crypto.join(', ')}_.`;
  str += ` Current round _${Store.round}_ ends in _${Task.getBetDateString('current').tillString}_ (${Task.getBetDateString('current').nextRoundTime}).`;

  const isCoolPeriod = Task.ifCoolPeriod(Date.now());
  if (isCoolPeriod) {
    str += `

**Note**: It is cool period—bets are accepted for next round _${Store.round+1}_ only, which ends in _${Task.getBetDateString('next').tillString}_ (${Task.getBetDateString('next').nextRoundTime}).`;
  } else {
    str += ` I have cool period of _${config.cool_period_hours}_ hours when I don't accept bets for current round. So I will accept bets for round _${Store.round}_ until ${Task.coolPeriodStartDate().dateString}.`;
  }

  str += `

**Rules**: All bets for each round are collected together. I take _${config.bureau_reward_percent}%_ for my service, and distribute _${100-config.bureau_reward_percent}%_ among winners.`;
  str += ` Your stake depends on Amount, forecast accuracy and time of bet. Earlier you place a bet, more stake you get. Winners guess _${config.bet_currency}_ rate _±${config.win_price_range}_ USD.`;
  str += ` _You can bet multiple times for different rates_. I accept minimal equivalent of _${config.min_value_usd}_ USD for betting and pay rewards greater then _${config.min_reward_usd}_ USD. Your daily limit is _${config.daily_limit_usd}_ USD.`;
  str += `

I understand commands:

**/rates** — I will provide market exchange rates for specific coin. F. e., _/rates ADM_ or _/rates USD_.

**/calc** — I will calculate one coin value in another using market exchange rates. Works like this: _/calc 2.05 BTC in USD_.

**To make a bet**, send me crypto here in-Chat. Amount is your bet and comment is your _${config.bet_currency}_ forecast rate. F. e., if you want to make a bet of 0.35 ETH on 10 600 USD for _${config.bet_currency}_, send in-Chat payment of 0.35 ETH to me with “10600” comment.

New features are coming soon! I am learning to provide current placed bets, notify about results for rounds, and new type of betting: maximum/ minimum rate during round, ascending or descending trend, will rate exceed special value or not.
`;

  return {
    msgNotify: ``,
    msgSendBack: str,
    notifyType: 'log',
  };
}

async function rates(params) {
  let output = '';

  try {
    const coin1 = params[0].toUpperCase().trim();

    if (!coin1 || !coin1.length) {
      output = 'Please specify coin ticker or specific market you are interested in. F. e., */rates ADM*.';
      return {
        msgNotify: ``,
        msgSendBack: `${output}`,
        notifyType: 'log',
      };
    }
    const currencies = Store.currencies;
    const res = Object
        .keys(Store.currencies)
        .filter((t) => t.startsWith(coin1 + '/'))
        .map((t) => {
          const p = `${coin1}/**${t.replace(coin1 + '/', '')}**`;
          return `${p}: ${currencies[t]}`;
        })
        .join(', ');

    if (!res.length) {
      output = `I can’t get rates for *${coin1}*. Made a typo? Try */rates ADM*.`;
      return {
        msgNotify: ``,
        msgSendBack: `${output}`,
        notifyType: 'log',
      };
    } else {
      output = `Global market rates for ${coin1}:\n${res}.`;
    }
  } catch (e) {
    log.error(`Error in rates() of ${helpers.getModuleName(module.id)} module: ${e}`);
  }

  return {
    msgNotify: ``,
    msgSendBack: output,
    notifyType: 'log',
  };
}

async function calc(arr) {
  let output = '';

  try {
    if (arr.length !== 4) {
      return {
        msgNotify: ``,
        msgSendBack: 'Wrong arguments. Command works like this: */calc 2.05 BTC in USDT*.',
        notifyType: 'log',
      };
    }

    const amount = +arr[0];
    const inCurrency = arr[1].toUpperCase().trim();
    const outCurrency = arr[3].toUpperCase().trim();

    if (!amount || amount === Infinity) {
      output = `It seems amount "*${amount}*" for *${inCurrency}* is not a number. Command works like this: */calc 2.05 BTC in USDT*.`;
    }
    if (!$u.isHasTicker(inCurrency)) {
      output = `I don’t have rates of crypto *${inCurrency}* from Infoservice. Made a typo? Try */calc 2.05 BTC in USDT*.`;
    }
    if (!$u.isHasTicker(outCurrency)) {
      output = `I don’t have rates of crypto *${outCurrency}* from Infoservice. Made a typo? Try */calc 2.05 BTC in USDT*.`;
    }

    let result;
    if (!output) {
      result = Store.cryptoConvert(inCurrency, outCurrency, amount, true).outAmount;
      if (amount <= 0 || result <= 0 || !result) {
        output = `I didn’t understand amount for *${inCurrency}*. Command works like this: */calc 2.05 BTC in USDT*.`;
      } else {
        if ($u.isFiat(outCurrency)) {
          result = +result.toFixed(2);
        }
        output = `Global market value of ${helpers.thousandSeparator(amount)} ${inCurrency} equals **${helpers.thousandSeparator(result)} ${outCurrency}**.`;
      }
    }
  } catch (e) {
    log.error(`Error in calc() of ${helpers.getModuleName(module.id)} module: ${e}`);
  }

  return {
    msgNotify: ``,
    msgSendBack: output,
    notifyType: 'log',
  };
}

function version() {
  return {
    msgNotify: ``,
    msgSendBack: `I am running on _adamant-betbot_ software version _${Store.version}_. Revise code on ADAMANT's GitHub.`,
    notifyType: 'log',
  };
}

const commands = {
  help,
  rates,
  calc,
  version,
};
