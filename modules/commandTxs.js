const Store = require('../modules/Store');
const $u = require('../helpers/utils');
const config = require('./configReader');
const log = require('../helpers/log');

module.exports = async (cmd, tx, itx) => {
	log.info('Got new Command Tx to process: ' + cmd);
	try {
		let msg = '';
		const group = cmd
			.trim()
			.replace(/    /g, ' ')
			.replace(/   /g, ' ')
			.replace(/  /g, ' ')
			.split(' ');
		const methodName = group.shift().trim().toLowerCase().replace('\/', '');
		const m = commands[methodName];
		if (m){
			msg = await m(group, tx);
		} else {
			msg = `I don’t know _/${methodName}_ command. ℹ️ You can start with **/help**.`;
		}
		if (!tx){
			return msg;
		}
		if (tx){
			$u.sendAdmMsg(tx.senderId, msg);
			itx.update({isProcessed: true}, true);
		}
	} catch (e){
		tx = tx || {};
		log.error('Error while processing command ' + cmd + ' from sendedId ' + tx.senderId + '. Tx Id: ' + tx.id + '. Error: ' + e);
	}
};

function help() {

	const Task = require('../helpers/CronTask');
	let str = `I am **online** and ready to accept your bets on _${config.bet_currency}_ rate. I accept and pay rewards in _${config.accepted_crypto.join(', ')}_.`;
	str += ` Current round _${Store.round}_ ends in _${Task.getBetDateString('current').tillString}_ (${Task.getBetDateString('current').nextRoundTime}).`;

	let isCoolPreriod = Task.ifCoolPeriod(Date.now());
	if (isCoolPreriod) {
		str += `

**Note**: It is cool period—bets are accepted for next round _${Store.round+1}_ only, which ends in _${Task.getBetDateString('next').tillString}_ (${Task.getBetDateString('next').nextRoundTime}).`;
	} else {
		str += ` I have cool period of _${config.cool_period_hours}_ hours when I don't accept bets for current round. So I will accept bets for round _${Store.round}_ until ${Task.coolPeriodStartDate().datestring}.`;
	}

	str += `

**Rules**: all bets for each round are collected together. I take _${config.bureau_reward_percent}%_ for my service, and distribute _${100-config.bureau_reward_percent}%_ among winners.`;
	str += ` Your stake depends on Amount, forecast accuracy and time of bet. Earlier you place a bet, more stake you get. Winners guess _${config.bet_currency}_ rate _±${config.win_price_range}_ USD.`;
	str += ` _You can bet multiple times for different rates_. I accept minimal equivalent of _${config.min_value_usd}_ USD for betting and pay rewards greater then _${config.min_reward_usd}_ USD. Your daily limit is _${config.daily_limit_usd}_ USD.`;
	return str + `

I understand commands:

**/rates** — I will provide market exchange rates for specific coin. F. e., _/rates ADM_ or _/rates USD_.

**/calc** — I will calculate one coin value in another using market exchange rates. Works like this: _/calc 2.05 BTC in USD_.

**To make a bet**, just send me crypto here in-Chat. Amount is your bet and comment is your _${config.bet_currency}_ forecast rate. F. e., if you want to make a bet of 0.35 ETH on 10 600 USD for _${config.bet_currency}_, send in-Chat payment of 0.35 ETH to me with “10600” comment.

New features are coming soon! I am learning to provide current placed bets, notify about results for rounds, and new type of betting: maximum/ minimum rate during round, ascending or descending trend, will rate exceed special value or not (make a bet if McAfee will eat his dick).
`;
}

async function rates(arr) {
	const coin = (arr[0] || '').toUpperCase().trim();
	if (!coin || !coin.length){
		return 'Please specify coin ticker you are interested in. F. e., _/rates ADM_.';
	}
	const currencies = Store.currencies;
	const res = Object
		.keys(Store.currencies)
		.filter(t => t.startsWith(coin + '/'))
		.map(t => {
			let pair = `${coin}/**${t.replace(coin + '/', '')}**`;
			return `${pair}: ${currencies[t]}`;
		})
		.join(', ');

	if (!res.length){
		return `I can’t get rates for _${coin}_. Made a typo? Try _/rates ADM_.`;
	}
	return `Market rates:

${res}.`;
}

function calc(arr) {
	if (arr.length !== 4) { // error request
		return 'Wrong arguments. Command works like this: _/calc 2.05 BTC in USD_.';
	}

	const amount = +arr[0];
	const inCurrency = arr[1].toUpperCase().trim();
	const outCurrency = arr[3].toUpperCase().trim();

	if (!amount || amount === Infinity){
		return `It seems amount "_${amount}_" for _${inCurrency}_ is not a number. Command works like this: _/calc 2.05 BTC in USD_.`;
	}
	if (!$u.isHasTicker(inCurrency)) {
		return `I don’t know crypto _${inCurrency}_. Command works like this: _/calc 2.05 BTC in USD_.`;
	}
	if (!$u.isHasTicker(outCurrency)) {
		return `I don’t know crypto _${outCurrency}_. Command works like this: _/calc 2.05 BTC in USD_.`;
	}
	let result = Store.cryptoConvert(inCurrency, outCurrency, amount);

	if (amount <= 0 || result <= 0 || !result) {
		return `I didn’t understand amount for _${inCurrency}_. Command works like this: _/calc 2.05 BTC in USD_.`;
	}
	if ($u.isFiat(outCurrency)) {
		result = +result.toFixed(2);
	}
	return `Market value of ${$u.thousandSeparator(amount)} ${inCurrency} equals **${$u.thousandSeparator(result)} ${outCurrency}**.`;
}

function version(){
	return `I am running on _adamant-betbot_ software version _${Store.version}_. Revise code on ADAMANT's GitHub.`;
}


const commands = {
	help,
	rates,
	calc,
	version
};
