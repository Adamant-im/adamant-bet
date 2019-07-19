const db = require('./DB');
const config = require('./configReader');
const $u = require('../helpers/utils');
const Store = require('./Store');
const log = require('../helpers/log');
const notify = require('../helpers/notify');

module.exports = async () => {
	const {rewardsPayoutsDb} = db;

	(await rewardsPayoutsDb.find({
		isFinished: false,
		isPaused: false,
		outTxid: null
	})).forEach(async payout => {
		payout.triesSendCounter = ++payout.triesSendCounter || 0;
		let toBePaused = payout.triesSendCounter > 50 ? true : false;

		const {
			itxId,
			senderId,
			isFinished,
			betRound,
			winBet,
			accuracyKoef,
			earlyBetKoef,
			calcDate,
			payoutDate,
			senderKvsOutAddress,
			betMessageText,
			outCurrency,
			outAmount
		} = payout;

		

		let etherString = '';
		let addressString = senderKvsOutAddress === senderId ? senderKvsOutAddress : senderKvsOutAddress + ' (' + senderId + ')';

		if (outAmount + $u[outCurrency].FEE > Store.user[outCurrency].balance && toBePaused) {
			payout.update({
				error: 15,
				isPaused: toBePaused
			}, true);
			notify(`Bet Bot ${Store.botName} notifies about insufficient balance for reward payment of _${outAmount}_ _${outCurrency}_ to _${addressString}_ in round _${betRound}_. Payout is paused, attention needed. Balance of _${outCurrency}_ is _${Store.user[outCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${payout.itxId}.`, 'error');
			$u.sendAdmMsg(payout.senderId, `I can’t send you reward payment of _${outAmount}_ _${outCurrency}_ in round _${betRound}_ because of insufficient funds. I've already notified my master. Check my balances with **/balances** command. I will try to send transfer back to you.`);
			return;
		}

		log.info(`Attempt to send exchange payment:
			Coin: ${outCurrency},
			address:${senderKvsOutAddress},
			value: ${outAmount},
			balance: ${Store.user[outCurrency].balance}
		`);
		const result = await $u[outCurrency].send({
			address: senderKvsOutAddress,
			value: outAmount,
			comment: 'Done! Thank you for business. Hope to see you again.' // if ADM
		});
		log.info(`Exchange payment result:
		${JSON.stringify(result, 0, 2)}`);

		if (result.success) {
			payout.update({
				outTxid: result.hash
			}, true);
			Store.user[outCurrency].balance -= (outAmount + $u[outCurrency].FEE);
			log.info(`Successful exchange payment of ${outAmount} ${outCurrency}. Hash: ${result.hash}.`);
		} else { // Can't make a transaction

			if (payout.triesSendCounter++ < 50){
				payout.save();
				return;
			};
			payout.update({
				error: 16,
				needToSendBack: true,
			}, true);
			log.error(`Failed to make exchange payment of ${outAmount} ${outCurrency}. Income ADAMANT Tx: https://explorer.adamant.im/tx/${payout.itxId}.`);
			notify(`Exchange Bot ${Store.botName} cannot make transaction to exchange _${inAmountMessage}_ _${inCurrency}_ for _${outAmount}_ _${outCurrency}_. Will try to send payment back. Balance of _${outCurrency}_ is _${Store.user[outCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${payout.itxId}.`, 'error');
			$u.sendAdmMsg(payout.senderId, `I’ve tried to make transfer of _${outAmount}_ _${outCurrency}_ to you, but something went wrong. I will try to send payment back to you.`);
		}
	});
};

setInterval(() => {
	module.exports();
}, 10 * 1000);
