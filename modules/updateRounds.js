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
	.forEach(async cr => {
		try {
			log.info(`Packing round ${cr._id}. Date is ${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')}.`);
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

			} = cr;

			cr.totalBetsCount = 0;
			cr.totalSumUsd = 0;

			cr.totalADMbetsCount = 0;
			cr.totalETHbetsCount = 0;

			cr.totalADMbetsSum = 0;
			cr.totalETHbetsSum = 0;
			cr.totalADMbetsSumUsd = 0;
			cr.totalETHbetsSumUsd = 0;

			cr.totalWinnersCount = 0;
			cr.totalWinnersADMCount = 0;
			cr.totalWinnersETHCount = 0;

			cr.totalWinnersETHSum = 0;
			cr.totalWinnersADMSum = 0;
			cr.totalWinnersUsdSum = 0;

			cr.totalWinnersADMSumUsd = 0;
			cr.totalWinnersETHSumUsd = 0;

			cr.rewardPoolUsd = 0;
			cr.rewardPoolADM = 0;
			cr.rewardPoolETH = 0;

			cr.totalWinnersWeightedPoolUsd = 0;

			cr.winBet = 10000;
			cr.winPriceRange = config.win_price_range;
			cr.betCurrency = config.bet_currency;
			cr.leftMargin = cr.winBet - cr.winPriceRange;
			cr.rightMargin = cr.winBet + cr.winPriceRange;

			const {paymentsDb} = db;

			log.info(`Calculating all of validated transactions for round ${cr._id}. Date is ${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')}.`);
			(await paymentsDb.find({ // Select all of validated transactions for this round
				transactionIsValid: true,
				transactionIsFailed: false,
				needToSendBack: false,
				needHumanCheck: false,
				inTxStatus: true,
				betRound: cr._id,
			})).filter(p => p.inConfirmations >= config['min_confirmations_' + p.inCurrency])
				.forEach(async pay => {
					const {
						inAmountMessageUsd,
						betRateValue,
						isWinner,
						isCalculated,
						betRateDelta,
						accuracyKoef,
						earlyBetKoef,
						weightedValueUsd
					} = pay;

					cr.totalBetsCount++;
					cr.totalSumUsd+= pay.inAmountMessageUsd;

					pay.isWinner = (pay.betRateValue < cr.rightMargin) && (pay.betRateValue > cr.leftMargin);
					pay.betRateDelta = Math.abs(pay.betRateValue-cr.winBet);

					if(pay.isWinner){
						pay.accuracyKoef = 1 + (cr.winPriceRange - pay.betRateDelta) / cr.winPriceRange;
						pay.weightedValueUsd = pay.accuracyKoef * pay.earlyBetKoef * pay.inAmountMessageUsd;

						cr.totalWinnersCount++;
						cr.totalWinnersUsdSum+= pay.inAmountMessageUsd;
						cr.totalWinnersWeightedPoolUsd+= pay.weightedValueUsd;
					} else {
						pay.accuracyKoef = 0;
						pay.weightedValueUsd = 0;
					}

					switch (pay.inCurrency){
						case ('ETH'):
							cr.totalETHbetsCount++;
							cr.totalETHbetsSum+= pay.inAmountMessage;
							cr.totalETHbetsSumUsd+= pay.inAmountMessageUsd;
							if(pay.isWinner){
								cr.totalWinnersETHCount++;
								cr.totalWinnersETHSum+= pay.inAmountMessage;
								cr.totalWinnersETHSumUsd+= pay.inAmountMessageUsd;
							}					
							break;
						case ('ADM'):
							cr.totalADMbetsCount++;
							cr.totalADMbetsSum+= pay.inAmountMessage;
							cr.totalADMbetsSumUsd+= pay.inAmountMessageUsd;						
							if(pay.isWinner){
								cr.totalWinnersADMCount++;
								cr.totalWinnersADMSum+= pay.inAmountMessage;
								cr.totalWinnersADMSumUsd+= pay.inAmountMessageUsd;
							}					
							break;
					}

					pay.isCalculated = true;
					await pay.save();	
				});

				cr.rewardPoolUsd = cr.totalSumUsd * (1-config.bureau_reward_percent/100);
				cr.rewardPoolADM = cr.totalADMbetsSum * (1-config.bureau_reward_percent/100);
				cr.rewardPoolETH = cr.totalETHbetsSum * (1-config.bureau_reward_percent/100);

				log.info(`Calculating rewards and creating payouts for round ${cr._id}. Date is ${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')}.`);
				(await paymentsDb.find({ // Calculating rewards and notify users
					betRound: cr._id,
					isCalculated: true,
					isFinished: false
				})).forEach(async pay2 => {
						const {
							isFinished,
							isWinner,
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
						} = pay2;

						let msgSendBack = ``;
						let rewardsString = [];
						let newPayout;

						if(pay2.isWinner){
							pay2.rewardPercent = pay2.weightedValueUsd / cr.totalWinnersWeightedPoolUsd;
							pay2.payoutValueADM = pay2.rewardPercent * cr.rewardPoolADM;
							pay2.payoutValueETH = pay2.rewardPercent * cr.rewardPoolETH;
							pay2.payoutValueUsd = pay2.rewardPercent * cr.rewardPoolUsd;

							const {rewardsPayoutsDb} = db;

							// If no payout Tx added earlier, add it now for each of accepted coins
							let checkedTx;
							config.accepted_crypto.forEach(async (coin) => {
								const senderKvsFieldName = 'senderKvs' + coin + 'Address';
								const payoutValueFieldName = 'payoutValue' + coin;
								rewardsString.push(`**${$u.thousandSeparator(+(pay2[payoutValueFieldName].toFixed(8)), false)}** _${coin}_`);

								checkedTx = await rewardsPayoutsDb.findOne({admTxId: pay2.itxId, outCurrency: coin});
								if (checkedTx === null) {					
									newPayout = new rewardsPayoutsDb({
										itxId: pay2.admTxId,
										senderId: pay2.senderId,
										isFinished: false,
										isPaused: false,
										triesSendCounter: 0,
										betRound: pay2.betRound,
										winBet: cr.winBet,
										accuracyKoef: pay2.accuracyKoef,
										earlyBetKoef: pay2.earlyBetKoef,
										calcDate: Date.now(),
										senderKvsOutAddress: pay2[senderKvsFieldName],
										betMessageText: pay2.betMessageText,
										outCurrency: coin,
										outAmount: +(pay2[payoutValueFieldName].toFixed(8)),
										outAmountF: $u.thousandSeparator(+(pay2[payoutValueFieldName].toFixed(8)), false),
										outAmountUsd: Store.cryptoConvert(coin, 'USD', pay2[payoutValueFieldName]),
										outAmountUsdF: $u.thousandSeparator(Store.cryptoConvert(coin, 'USD', pay2[payoutValueFieldName]))
									});

									await newPayout.save();	
								};
							});
							
							msgSendBack = `**Bingo!** Your bet of ${pay2.betMessageText} won! Actual rate is _${$u.thousandSeparator(cr.winBet, false)}_ USD, accuracy coef — _${pay2.accuracyKoef.toFixed(2)}_. Early bet coef is _${pay2.earlyBetKoef.toFixed(2)}_.`;
							msgSendBack += `

Rewards are: ${rewardsString.join(', ')} (_~${$u.thousandSeparator(pay2.payoutValueUsd.toFixed(2), false)} USD_ at time of bets placed).`; 
							msgSendBack += ` I will send these funds soon, please be patient. Wish you luck next rounds!`;

						} else { // if isWinner === false
							msgSendBack = `D'oh! Your bet of ${pay2.betMessageText} lose. Actual rate is _${$u.thousandSeparator(cr.winBet, false)}_ USD. Wish you luck next rounds!`;
						}
						
						let logString = '';
						logString = `Round ${cr._id} results for ${pay2.senderId} / ${pay2.admTxId}: ${pay2.isWinner}.`;
						logString += ` Actual rate: ${$u.thousandSeparator(cr.winBet, false)} USD, accuracy coef: ${pay2.accuracyKoef.toFixed(2)}, Early bet coef: ${pay2.earlyBetKoef.toFixed(2)}.`;
						if(pay2.isWinner){
							logString += ` Rewards are: ${rewardsString.join(', ')} (~${$u.thousandSeparator(pay2.payoutValueUsd.toFixed(2), false)} USD at time of bets placed).`;
						}	
						logString += ` Bet message text: ${pay2.betMessageText}.`;

						log.info(logString);
						$u.sendAdmMsg(pay2.senderId, msgSendBack);
						pay2.isFinished = true;
						await pay2.save();	
					});

				poolsString = [];
				config.accepted_crypto.forEach(async (coin) => {
					const field3 = 'rewardPool' + coin;
					poolsString.push(`*${$u.thousandSeparator(cr[field3].toFixed(8), false)}* _${coin}_`);
				});

				// console.log('currentRound', currentRound);
				let msgNotify = '';
				msgNotify = `Finished packing round number _${cr._id}_. Current date is _${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')}_.`;
				msgNotify += ` Win rate: _${$u.thousandSeparator(cr.winBet, false)}_ USD for 1 _${cr.betCurrency}_.`;
				msgNotify += `

Total bets — _${$u.thousandSeparator(cr.totalBetsCount, false)}_ with _~${$u.thousandSeparator(cr.totalSumUsd.toFixed(2), false)}_ USD wagered.`;
				msgNotify += ` Winners' bets — _${$u.thousandSeparator(cr.totalWinnersCount, false)}_ with _~${$u.thousandSeparator(cr.totalWinnersUsdSum.toFixed(2), false)}_ USD wagered.`;
				msgNotify += `

Total rewards: ${poolsString.join(', ')} (*~${$u.thousandSeparator(cr.rewardPoolUsd.toFixed(2), false)}* _USD_ at time of bets placed).`;
				notify(msgNotify, 'log');

				// currentRound.packDate = Date.now();
				await cr.save();
				rewardsPayer();

			} catch (e) {
			log.error('Error in updateRounds module: ' + e);
		}
	});
}

setInterval(() => {
	module.exports();
}, 60 * 1000);
