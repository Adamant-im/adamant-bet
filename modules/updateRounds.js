const moment = require('moment');
const db = require('./DB');
const config = require('./configReader');
const $u = require('../helpers/utils');
const Store = require('./Store');
const Task = require('../helpers/CronTask');
const log = require('../helpers/log');
const notify = require('../helpers/notify');
const rewardsPayer = require('./rewardsPayer');

module.exports = async () => {

    const {roundsDb} = db;

	(await roundsDb.find({
		packDate: null,
	})).filter(r => r._id <= Store.round)
	.forEach(async currentRound => {
		try {
			log.info(`Packing round number ${currentRound._id}. Date is ${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')}.`);
			const {
				_id,
				finalDate,
				winBet,
				rightMargin,
				leftMargin,
				betCurrency,
				winPriceRange,

				totalBetsCount = 0,
				totalSumUsd = 0,

				totalADMbetsCount = 0,
				totalETHbetsCount = 0,

				totalADMbetsSum = 0,
				totalETHbetsSum = 0,
				totalADMbetsSumUsd = 0,
				totalETHbetsSumUsd = 0,

				totalWinnersCount = 0,
				totalWinnersADMCount = 0,
				totalWinnersETHCount = 0,

				totalWinnersETHSum = 0,
				totalWinnersADMSum = 0,
				totalWinnersUsdSum = 0,

				totalWinnersADMSumUsd = 0,
				totalWinnersETHSumUsd = 0,

				rewardPoolUsd = 0,
				rewardPoolADM = 0,
				rewardPoolETH = 0,

				totalWinnersWeightedPoolUsd = 0

			} = currentRound;

			currentRound.totalBetsCount = 0;
			currentRound.totalSumUsd = 0;

			currentRound.totalADMbetsCount = 0;
			currentRound.totalETHbetsCount = 0;

			currentRound.totalADMbetsSum = 0;
			currentRound.totalETHbetsSum = 0;
			currentRound.totalADMbetsSumUsd = 0;
			currentRound.totalETHbetsSumUsd = 0;

			currentRound.totalWinnersCount = 0;
			currentRound.totalWinnersADMCount = 0;
			currentRound.totalWinnersETHCount = 0;

			currentRound.totalWinnersETHSum = 0;
			currentRound.totalWinnersADMSum = 0;
			currentRound.totalWinnersUsdSum = 0;

			currentRound.totalWinnersADMSumUsd = 0;
			currentRound.totalWinnersETHSumUsd = 0;

			currentRound.rewardPoolUsd = 0;
			currentRound.rewardPoolADM = 0;
			currentRound.rewardPoolETH = 0;

			currentRound.totalWinnersWeightedPoolUsd = 0;

			currentRound.winBet = 10000;
			currentRound.winPriceRange = config.win_price_range;
			currentRound.betCurrency = config.bet_currency;
			currentRound.leftMargin = currentRound.winBet - currentRound.winPriceRange;
			currentRound.rightMargin = currentRound.winBet + currentRound.winPriceRange;

			const {paymentsDb} = db;

			(await paymentsDb.find({ // Select all of validated transactions for this round
				transactionIsValid: true,
				transactionIsFailed: false,
				needToSendBack: false,
				needHumanCheck: false,
				inTxStatus: true,
				betRound: currentRound._id,
			})).filter(p => p.inConfirmations >= config['min_confirmations_' + p.inCurrency])
				.forEach(async pay => {
					const {
						inAmountMessageUsd,
						betRateValue,
						isWinner,
						betRateDelta,
						accuracyKoef,
						earlyBetKoef,
						weightedValueUsd
					} = pay;

					currentRound.totalBetsCount++;
					currentRound.totalSumUsd+= pay.inAmountMessageUsd;

					pay.isWinner = (pay.betRateValue < currentRound.rightMargin) && (pay.betRateValue > currentRound.leftMargin);

					pay.betRateDelta = +(pay.betRateValue-currentRound.winBet);
					pay.accuracyKoef = 1 + (currentRound.winPriceRange - pay.betRateDelta) / currentRound.winPriceRange;
					pay.weightedValueUsd = pay.accuracyKoef * pay.earlyBetKoef * pay.inAmountMessageUsd;

					if(pay.isWinner){
						currentRound.totalWinnersCount++;
						currentRound.totalWinnersUsdSum+= pay.inAmountMessageUsd;
						currentRound.totalWinnersWeightedPoolUsd+= pay.weightedValueUsd;
					}

					switch (pay.inCurrency){
						case ('ETH'):
							currentRound.totalETHbetsCount++;
							currentRound.totalETHbetsSum+= pay.inAmountMessage;
							currentRound.totalETHbetsSumUsd+= pay.inAmountMessageUsd;
							if(pay.isWinner){
								currentRound.totalWinnersETHCount++;
								currentRound.totalWinnersETHSum+= pay.inAmountMessage;
								currentRound.totalWinnersETHSumUsd+= pay.inAmountMessageUsd;
							}					
							break;
						case ('ADM'):
							currentRound.totalADMbetsCount++;
							currentRound.totalADMbetsSum+= pay.inAmountMessage;
							currentRound.totalADMbetsSumUsd+= pay.inAmountMessageUsd;						
							if(pay.isWinner){
								currentRound.totalWinnersADMCount++;
								currentRound.totalWinnersADMSum+= pay.inAmountMessage;
								currentRound.totalWinnersADMSumUsd+= pay.inAmountMessageUsd;
							}					
							break;
					}

					pay.save();	
				});

				currentRound.rewardPoolUsd = currentRound.totalSumUsd * (1-config.bureau_reward_percent/100);
				currentRound.rewardPoolADM = currentRound.totalADMbetsSum * (1-config.bureau_reward_percent/100);
				currentRound.rewardPoolETH = currentRound.totalETHbetsSum * (1-config.bureau_reward_percent/100);

				(await paymentsDb.find({ // Calculating rewards and notify users
					betRound: currentRound._id,
					isFinished: false,
					isWinner: true
				})).forEach(async pay => {
						const {
							isFinished,
							admTxId,
							senderId,
							senderKvsADMAddress,
							senderKvsETHAddress,

							accuracyKoef,
							earlyBetKoef,
							betRound,
							betMessageText,
							weightedValueUsd,
							rewardPercent,
							payoutValueADM,
							payoutValueETH,
							payoutValueUsd
						} = pay;

						let msgSendBack = ``;
						if(pay.isWinner){
							pay.rewardPercent = pay.weightedValueUsd / currentRound.totalWinnersWeightedPoolUsd;
							pay.payoutValueADM = pay.rewardPercent * currentRound.rewardPoolADM;
							pay.payoutValueETH = pay.rewardPercent * currentRound.rewardPoolETH;
							pay.payoutValueUsd = pay.rewardPercent * currentRound.rewardPoolUsd;

							const {rewardsPayoutsDb} = db;

							// If no payout Tx added earlier, add it now for each of accepted coins
							let checkedTx;
							let rewardsString = [];
							config.accepted_crypto.forEach(async (coin) => {
								const field = 'senderKvs' + coin + 'Address';
								const field2 = 'payoutValue' + coin;
								rewardsString.push(`**${$u.thousandSeparator(pay[field2].toFixed(8), false)}** _${coin}_`);

								checkedTx = await rewardsPayoutsDb.findOne({admTxId: pay.itxId, outCurrency: coin});
								if (checkedTx === null) {					
									newPayout = new rewardsPayoutsDb({
										itxId: pay.admTxId,
										senderId: pay.senderId,
										isFinished: false,
										isPaused: false,
										betRound: pay.betRound,
										winBet: currentRound.winBet,
										accuracyKoef: pay.accuracyKoef,
										earlyBetKoef: pay.earlyBetKoef,
										calcDate: Date.now(),
										senderKvsOutAddress: pay[field],
										betMessageText: pay.betMessageText,
										outCurrency: coin,
										outAmount: pay[field2],
										outAmountUsd: Store.cryptoConvert(coin, 'USD', pay[field2])
									});
									// console.log('newPayout', newPayout);
									newPayout.save();	
								};
							});
							
							msgSendBack = `**Bingo!** Your bet of ${pay.betMessageText} won! Actual rate is _${$u.thousandSeparator(currentRound.winBet, false)}_ USD, accuracy coef — _${pay.accuracyKoef.toFixed(2)}_. Early bet coef is _${pay.earlyBetKoef.toFixed(2)}_.`;
							msgSendBack += `

Rewards are: ${rewardsString.join(', ')} (_~${$u.thousandSeparator(pay.payoutValueUsd.toFixed(2), false)} USD_ at time of bets placed).`; 
							msgSendBack += ` I will send these funds soon, please be patient. Wish you luck next rounds!`;

							// If no payout ETH Tx added earlier, add it now
							// let checkedTx = await rewardsPayoutsDb.findOne({admTxId: pay.admTxId, outCurrency: 'ETH'});
							// if (checkedTx === null) {					
							// 	let newPayout = new rewardsPayoutsDb({
							// 		admTxId: pay.admTxId,
							// 		isFinished: false,
							// 		betRound: pay.betRound,
							// 		winBet: currentRound.winBet,
							// 		accuracyKoef: pay.accuracyKoef,
							// 		earlyBetKoef: pay.earlyBetKoef,
							// 		calcDate: Date.now(),
							// 		senderKvsADMAddress: pay.senderKvsADMAddress,
							// 		senderKvsETHAddress: pay.senderKvsETHAddress,
							// 		betMessageText: pay.betMessageText,
							// 		outCurrency: 'ETH',
							// 		outValue: payoutValueETH
							// 	});
							// 	newPayout.save();	
							// };
		

							// checkedTx = await rewardsPayoutsDb.findOne({admTxId: pay.admTxId, outCurrency: 'ADM'});
							// if (checkedTx === null) {					
							// 	newPayout = new rewardsPayoutsDb({
							// 		admTxId: pay.admTxId,
							// 		isFinished: false,
							// 		betRound: pay.betRound,
							// 		winBet: currentRound.winBet,
							// 		accuracyKoef: pay.accuracyKoef,
							// 		earlyBetKoef: pay.earlyBetKoef,
							// 		calcDate: Date.now(),
							// 		senderKvsADMAddress: pay.senderKvsADMAddress,
							// 		senderKvsETHAddress: pay.senderKvsETHAddress,
							// 		betMessageText: pay.betMessageText,
							// 		outCurrency: 'ADM',
							// 		outValue: payoutValueADM
							// 	});
							// 	newPayout.save();	
							// };
						} else { // if isWinner === false
							msgSendBack = `D'oh! Your bet of ${pay.betMessageText} lose. Actual rate is _${$u.thousandSeparator(currentRound.winBet, false)}_ USD. Wish you luck next rounds!`;
						}
						
						let logString = '';
						logString = `Round ${currentRound._id} results for ${pay.senderId} / ${pay.admTxId}: ${pay.iWinner}.`;
						logString += ` Actual rate: ${$u.thousandSeparator(currentRound.winBet, false)} USD, accuracy coef: ${pay.accuracyKoef.toFixed(2)}, Early bet coef: ${pay.earlyBetKoef.toFixed(2)}.`;
						logString += ` Rewards are: ${rewardsString.join(', ')} (~${$u.thousandSeparator(pay.payoutValueUsd.toFixed(2), false)} USD at time of bets placed).`;
						logString += ` Bet message text: ${pay.betMessageText}.`;

						log.info(logString);
						$u.sendAdmMsg(pay.senderId, msgSendBack);
						pay.isFinished = true;
						pay.save();	
					});
	
				poolsString = [];
				config.accepted_crypto.forEach(async (coin) => {
					const field3 = 'rewardPool' + coin;
					poolsString.push(`*${$u.thousandSeparator(currentRound[field3].toFixed(8), false)}* _${coin}_`);
				});

				// console.log('currentRound', currentRound);
				let msgNotify = '';
				msgNotify = `Finished packing round number _${currentRound._id}_. Current date is _${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')}_.`;
				msgNotify += ` Win rate: _${$u.thousandSeparator(currentRound.winBet, false)}_ USD for 1 _${currentRound.betCurrency}_.`;
				msgNotify += `

Total bets — _${$u.thousandSeparator(currentRound.totalBetsCount, false)}_ with _~${$u.thousandSeparator(currentRound.totalSumUsd.toFixed(2), false)}_ USD wagered.`;
				msgNotify += ` Winners' bets — _${$u.thousandSeparator(currentRound.totalWinnersCount, false)}_ with _~${$u.thousandSeparator(currentRound.totalWinnersUsdSum.toFixed(2), false)}_ USD wagered.`;
				msgNotify += `

Total rewards: ${poolsString.join(', ')} (*~${$u.thousandSeparator(currentRound.rewardPoolUsd.toFixed(2), false)}* _USD_ at time of bets placed).`;
				notify(msgNotify, 'log');

				// currentRound.packDate = Date.now();
				currentRound.save();
				rewardsPayer();

			} catch (e) {
			log.error('Error in updateRounds module: ' + e);
		}
	});
}

setInterval(() => {
	module.exports();
}, 10 * 1000);
