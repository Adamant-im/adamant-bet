const db = require('./DB');
const config = require('./configReader');
const $u = require('../helpers/utils');
const Store = require('./Store');
const log = require('../helpers/log');
const notify = require('../helpers/notify');

module.exports = async () => {
	const {paymentsDb} = db;
	await $u.updateAllBalances();

	const pays = (await paymentsDb.find({
		transactionIsValid: true,
		isFinished: false,
		transactionIsFailed: false,
		needToSendBack: true,
		needHumanCheck: false,
		inTxStatus: true,
		outTxid: null,
		sentBackTx: null
	})).filter(p => p.inConfirmations >= config['min_confirmations_' + p.inCurrency]);

	for (const pay of pays){
		pay.counterSendBack = pay.counterSendBack || 0;
		const {
			inAmountReal,
			inCurrency,
			senderKvsInAddress
		} = pay;

		let msgSendBack = false;
		let msgNotify = false;
		let etherString = '';
		let notifyType = 'log';

		const outFee = $u[inCurrency].FEE;
		const sentBackAmount = +(inAmountReal - outFee).toFixed(8);
		const sentBackAmountUsd = Store.cryptoConvert(inCurrency, 'USD', sentBackAmount);
		pay.update({
			outFee,
			sentBackAmount,
			sentBackAmountUsd
		});
		
		if (sentBackAmount <= 0){
			pay.update({
				errorSendBack: 17,
				isFinished: true
			});
			notifyType = 'log';
			msgNotify = `Bet Bot ${Store.botName} won’t send back payment of _${inAmountReal}_ _${inCurrency}_ because it is less than transaction fee. Income ADAMANT Tx: https://explorer.adamant.im/tx/${pay.itxId}.`;
			msgSendBack = 'I can’t send transfer back to you because it does not cover blockchain fees. If you think it’s a mistake, contact my master.';
		} else if (sentBackAmount > Store.user[inCurrency].balance){
			notifyType = 'error';
			msgNotify = `Bet Bot ${Store.botName} notifies about insufficient balance for send back of _${inAmountReal}_ _${inCurrency}_. Attention needed. Balance of _${inCurrency}_ is _${Store.user[inCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${pay.itxId}.`;
			msgSendBack = 'I can’t send transfer back to you because of insufficient balance. I’ve already notified my master. If you wouldn’t receive transfer in two days, contact my master also.';
			pay.update({
				errorSendBack: 18,
				needHumanCheck: true,
				isFinished: true
			});
		} else { // We are able to send transfer back
			const result = await $u[inCurrency].send({
				address: senderKvsInAddress,
				value: sentBackAmount,
				comment: 'Here is your refund. Note, some amount spent to cover blockchain fees. Try again!' // if ADM
			});

			if (result.success) {
				pay.sentBackTx = result.hash;
				Store.user[inCurrency].balance -= sentBackAmount;
				log.info(`Successful send back of ${sentBackAmount} ${inCurrency}. Hash: ${result.hash}.`);
			} else { // Can't make a transaction

				if (++pay.counterSendBack < 50){
					await pay.save();
					return;
				};

				pay.update({
					errorSendBack: 19,
					needHumanCheck: true,
					isFinished: true
				});
				notifyType = 'error';
				log.error(`Failed to send back of ${sentBackAmount} ${inCurrency}. Income ADAMANT Tx: https://explorer.adamant.im/tx/${pay.itxId}.`);
				msgNotify = `Bet Bot ${Store.botName} cannot make transaction to send back _${sentBackAmount}_ _${inCurrency}_. Attention needed. Balance of _${inCurrency}_ is _${Store.user[inCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${pay.itxId}.`;
				msgSendBack = 'I’ve tried to send back transfer to you, but something went wrong. I’ve already notified my master. If you wouldn’t receive transfer in two days, contact my master also.';
			}
		}
		log.info(`sendBack logs:
			Coin: ${inCurrency}
			tx: ${pay.sentBackTx}
			error: ${pay.errorSendBack}
			balance: ${Store.user[inCurrency].balance}
			fee: ${outFee}
			amount: ${sentBackAmount}
			eqUsd: ${sentBackAmountUsd}
		`);
		await pay.save();
		if (msgNotify){
			notify(msgNotify, notifyType);
		}
		if (msgSendBack){
			$u.sendAdmMsg(pay.senderId, msgSendBack);
		}
	}
};

setInterval(() => {
	module.exports();
}, 17 * 1000);
