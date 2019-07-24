const log = require('../helpers/log');
const $u = require('../helpers/utils');
const notify = require('../helpers/notify');
const Store = require('./Store');
const config = require('./configReader');
const db = require('./DB');
const api = require('./api');

module.exports = async (pay, tx) => {

	pay.counterTxDeepValidator = ++pay.counterTxDeepValidator || 0;
	if (!tx){
		await pay.save();
		return;
	}
	// Fetching addresses from ADAMANT KVS
	try {
		let senderKvsADMAddress = tx.senderId;
		let senderKvsETHAddress = pay.senderKvsETHAddress || await $u.getAddressCryptoFromKVS('ETH', tx.senderId);
		let senderKvsInAddress;

		switch (pay.inCurrency){
			case ('ETH'):
				senderKvsInAddress = senderKvsETHAddress;
				break;
			case ('ADM'):
				senderKvsInAddress = senderKvsADMAddress;
				break;
		}

		pay.update({
			senderKvsInAddress,
			senderKvsADMAddress,
			senderKvsETHAddress
		});

		if (!senderKvsETHAddress){
			log.error(`Can't get ETH address from KVS. Will try next time.`);
			await pay.save();
			return;
		}

		let notifyType = 'log';
		if (senderKvsETHAddress === 'none') {

			if(!pay.isKVSnotFoundNotified) {
				notifyType = 'warn';
				notify(`Bet Bot ${Store.botName} cannot fetch _ETH_ address from KVS. Income ADAMANT Tx: https://explorer.adamant.im/tx/${tx.id}. Will try to send back.`, 'warn');
				$u.sendAdmMsg(tx.senderId, `I can’t get your _ETH_ address from ADAMANT KVS. It is necessary to send reward in case of win. I'll try to send transfer back to you now. Before next bet, re-login into your ADAMANT account using app that supports _ETH_.`);
			}
			pay.update({
				error: 8,
				needToSendBack: true,
				isKVSnotFoundNotified: true // need to verify Tx even if send back
			}, true);
		};

		let msgSendBack = false;
		let msgNotify = false;

		// Validating incoming TX in blockchain of inCurrency
		try {
			const in_tx = await $u[pay.inCurrency].syncGetTransaction(pay.inTxid, tx);
			if (!in_tx) {
				if (pay.counterTxDeepValidator < 20){
					await pay.save();
					return;
				}
				pay.update({
					transactionIsValid: false,
					isFinished: true,
					error: 10
				});
				notifyType = 'warn';
				msgNotify = `Bet Bot ${Store.botName} can’t fetch transaction of _${pay.inAmountMessage} ${pay.inCurrency}_.`;
				msgSendBack = `I can’t get transaction of _${pay.in_amount_message} ${pay.inCurrency}_ with Tx ID _${pay.inTxid}_ from _ ${pay.inCurrency}_ blockchain. It might be failed or cancelled. If you think it’s a mistake, contact my master.`;
			} else {
				pay.update({
					senderReal: in_tx.sender,
					recipientReal: in_tx.recipient,
					inAmountReal: in_tx.amount
				});

				if (String(pay.senderReal).toLowerCase() !== String(pay.senderKvsInAddress).toLowerCase()) {
					pay.update({
						transactionIsValid: false,
						isFinished: true,
						error: 11
					});
					notifyType = 'warn';
					msgNotify = `Bet Bot ${Store.botName} thinks transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ is wrong. Sender expected: _${pay.senderKvsInAddress}_, but real sender is _${pay.senderReal}_.`;
					msgSendBack = `I can’t validate transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ with Tx ID _${pay.inTxid}_. If you think it’s a mistake, contact my master.`;
				} else if (String(pay.recipientReal).toLowerCase() !== Store.user[pay.inCurrency].address.toLowerCase()) {
					pay.update({
						transactionIsValid: false,
						isFinished: true,
						error: 12
					});
					notifyType = 'warn';
					msgNotify = `Bet Bot ${Store.botName} thinks transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ is wrong. Recipient expected: _${Store.user[pay.inCurrency].address}_, but real recipient is _${pay.recipientReal}_.`;
					msgSendBack = `I can’t validate transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ with Tx ID _${pay.inTxid}_. If you think it’s a mistake, contact my master.`;
				} else if (Math.abs(pay.inAmountReal - pay.inAmountMessage) > pay.inAmountReal * 0.005) {
					pay.update({
						transactionIsValid: false,
						isFinished: true,
						error: 13
					});
					notifyType = 'warn';
					msgNotify = `Bet Bot ${Store.botName} thinks transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ is wrong. Amount expected: _${pay.inAmountMessage}_, but real amount is _${pay.inAmountReal}_.`;
					msgSendBack = `I can’t validate transaction of _${pay.inAmountMessage}_ _${pay.inCurrency}_ with Tx ID _${pay.inTxid}_. If you think it’s a mistake, contact my master.`;
				} else { // Transaction is valid
					pay.update({
						transactionIsValid: true,
						inConfirmations: 0
					});
				}
			}
		} catch (e) {
			log.error('Error while validating non-ADM transaction: ' + e);
		}

		await pay.save();
		if (msgSendBack) {
			notify(msgNotify + ` Tx hash: _${pay.inTxid}_. Income ADAMANT Tx: https://explorer.adamant.im/tx/${tx.id}.`, notifyType);
			$u.sendAdmMsg(tx.senderId, msgSendBack);
		}
	} catch (e) {
		log.error('Error in deepTxValidator module: ' + e);
	}
};

setInterval(async ()=>{
	
	const {paymentsDb} = db;
	(await paymentsDb.find({
		transactionIsValid: null,
		isFinished: false
	})).forEach(async pay => {
		try {
			const tx = (await api.get('transaction', pay.admTxId)).transaction;
			module.exports(pay, tx);
		} catch (e){
			module.exports(pay, null);
		}
	});
}, 20 * 1000);