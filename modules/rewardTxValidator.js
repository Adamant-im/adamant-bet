const db = require('./DB');
const config = require('./configReader');
const $u = require('../helpers/utils');
const Store = require('./Store');
const log = require('../helpers/log');
const notify = require('../helpers/notify');

module.exports = async () => {
	const {rewardsPayoutsDb} = db;
	const lastBlockNumber = {
		ETH: await $u.ETH.getLastBlockNumber(),
		ADM: await $u.ADM.getLastBlockNumber(),
	};

	(await rewardsPayoutsDb.find({
		isFinished: false,
		isPayoutMade: true,
		outTxid: {$ne: null}
	})).forEach(async payout => {
		let {
			itxId,
			senderId,
			isFinished,
			isPayoutMade,
			betRound,
			senderKvsOutAddress,
			outCurrency,
			outAmount,
			outAmountUsd,
			outAmountF,
			triesValidateCounter,
			outTxid,
			error,
			needHumanCheck,
			outTxStatus,
			outConfirmations
		} = payout;

		triesValidateCounter += 1;
		await payout.update({
			triesValidateCounter
		});

		let	sendCurrency,
			sendTxId,
			sendAmount,
			etherString;

		let addressString = senderKvsOutAddress === senderId ? senderKvsOutAddress : senderKvsOutAddress + ' (' + senderId + ')';

		sendCurrency = outCurrency;
		sendTxId = outTxid;
		sendAmount = outAmount;

		try {

			if (!lastBlockNumber[sendCurrency]) {
				log.warn('Cannot get lastBlockNumber for ' + sendCurrency + '. Waiting for next try.');
				return;
			}

			const txData = (await $u[sendCurrency].getTransactionStatus(sendTxId));
			if (!txData || !txData.blockNumber){
				if (triesValidateCounter > 50){
					await payout.update({
						error: 24,
						isFinished: true,
						needHumanCheck: true
					});
					notify(`Bet Bot ${Store.botName} unable to verify reward transaction of _${outAmount}_ _${outCurrency}_ to _${addressString}_ in round _${betRound}_. Tx hash: _${sendTxId}_. Tried 50 times. Payout is paused, attention needed. Balance of _${outCurrency}_ is _${Store.user[outCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${itxId}.`, 'error');
					$u.sendAdmMsg(senderId, `I’ve tried to make reward transfer of _${outAmount}_ _${outCurrency}_ to you, but I cannot validate transaction. Tx hash: _${sendTxId}_. I’ve already notified my master. If you wouldn’t receive transfer in two days, contact my master also.`);
					msgSendBack = ``;
					}
				await payout.save();
				return;
			}
			const {status, blockNumber} = txData;

			if (!blockNumber) {
				log.warn(`Cannot get blockNumber to verify reward transaction of _${outAmount}_ _${outCurrency}_ to _${addressString}_ in round _${betRound}_. Waiting for next try.`);
				return;
			}

			await payout.update({
				outTxStatus: status,
				outConfirmations: lastBlockNumber[sendCurrency] - blockNumber
			}, true);

			if (status === false) {
				await payout.update({
					error: 31,
					outTxid: null,
					isPayoutMade: false
				});
				notify(`Bet Bot ${Store.botName} notifies that reward transaction of _${outAmount}_ _${outCurrency}_ to _${addressString}_ in round _${betRound}_ failed. Tx hash: _${sendTxId}_. Will try again. Balance of _${sendCurrency}_ is _${Store.user[sendCurrency].balance}_. ${etherString}Income ADAMANT Tx: https://explorer.adamant.im/tx/${itxId}.`, 'error');
				await $u.sendAdmMsg(senderId, `I’ve tried to make transfer of _${outAmount}_ _${outCurrency}_ to you, but it seems transaction failed. Tx hash: _${sendTxId}_. I will try again. If I’ve said the same several times already, please contact my master.`);

			} else if (status && payout.outConfirmations >= config['min_confirmations_' + sendCurrency]){

				notify(`Bet Bot ${Store.botName} successfully payed reward of _${outAmount}_ _${outCurrency}_ to _${addressString}_ in round _${betRound}_. Tx hash: _${sendTxId}_. Income ADAMANT Tx: https://explorer.adamant.im/tx/${itxId}.`, 'info');
				let msgToUser = 'Hey, you are lucky! Waiting for new bets!';

				if (sendCurrency !== 'ADM'){
					msgToUser = `{"type":"${sendCurrency}_transaction","amount":"${sendAmount}","hash":"${sendTxId}","comments":"${msgToUser}"}`;
					isFinished = await $u.sendAdmMsg(senderId, msgToUser, 'rich');
				} else {
					isFinished = true;
				}
				await payout.update({
					isFinished
				});

			}

			await payout.save();

		} catch (e) {
			log.error('Error in rewardTxValidator module ', {sendAmount, sendCurrency, sendTxId}, e);
		}
	});

};
setInterval(() => {
	module.exports();
}, 15 * 1000);
