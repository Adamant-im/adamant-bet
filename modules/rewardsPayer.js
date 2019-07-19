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
		log.info(`RewardsPayer().`);

		// If round is not fully calculated yet, do nothing
		const {roundsDb} = db;
		payoutRound = await roundsDb.findOne({_id: payout.betRound});
	
		if(!payoutRound.packDate){
			log.info(`Attempt to make payout for not fully calculated round ${payout.betRound}. Will try next time.`);
			return;
		}

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
			outAmount,
			outAmountUsd,
			isZeroAmount
		} = payout;

		let etherString = '';
		let addressString = senderKvsOutAddress === senderId ? senderKvsOutAddress : senderKvsOutAddress + ' (' + senderId + ')';
		let logString = '';

		if (!outAmount || outAmount === 0){
			payout.update({
				isZeroAmount: true,
				isFinished: true
			}, true);
			
			logString = `Amount is ${outAmount} for payout to ${addressString} / ${pay.admTxId} (round ${pay.betRound})`;
			log.info(logString);
			return;

		} else if (outAmountUsd < config.min_reward_usd){
			pay.update({
				errorSendBack: 17,
				isFinished: true
			});
			notifyType = 'log';
			msgNotify = `Bet Bot ${Store.botName} won’t send back payment of _${inAmountReal}_ _${inCurrency}_ because it is less than transaction fee. Income ADAMANT Tx: https://explorer.adamant.im/tx/${pay.itxId}.`;
			msgSendBack = 'I can’t send transfer back to you because it does not cover blockchain fees. If you think it’s a mistake, contact my master.';
		} else if (outAmount + $u[outCurrency].FEE > Store.user[outCurrency].balance && toBePaused) {
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

		pay.save();
		if (msgNotify){
			notify(msgNotify, notifyType);
		}
		if (msgSendBack){
			$u.sendAdmMsg(pay.senderId, msgSendBack);
		}

	});
};

setInterval(() => {
	module.exports();
}, 10 * 1000);
