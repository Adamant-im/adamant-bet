const moment = require('moment');
const db = require('./DB');
const config = require('./configReader');
const $u = require('../helpers/utils');
const Store = require('./Store');
const log = require('../helpers/log');
const notify = require('../helpers/notify');
const rewardsPayer = require('./rewardsPayer');

module.exports = async () => {

    const {roundsDb} = db;

	(await roundsDb.find({
        calcWinnersDate: null,
		packDate: {$ne: null},
		_id: {$lt: Store.round} // calc only ended rounds
	}))
	.forEach(async cr => {
		try {

			let {
				_id,
				duration,
				createDate,
				endDate,
                fullRoundDuration,
                calcWinnersDate,

				winBet,
				betCurrency,
				rewardPoolUsd,
				rewardPoolADM,
				rewardPoolETH,
				totalWinnersWeightedPoolUsd
			} = cr;

        let infoString = `Calculating rewards and creating payouts for round ${_id}. Date is ${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')}.`;
        infoString += ` Round created: ${moment(createDate).format('YYYY/MM/DD HH:mm Z')}. Duration: ${$u.timeDiffDaysHoursMins(duration)}.`;
        infoString += ` Round end date: ${moment(endDate).format('YYYY/MM/DD HH:mm Z')}. Full round duration: ${$u.timeDiffDaysHoursMins(fullRoundDuration)}.`;
        log.info(infoString);

        const {paymentsDb} = db;
        (await paymentsDb.find({ // Calculating rewards and notify users
            betRound: _id,
            //isCalculated: true, // pay.isCalculated is saving some time and payments may be excluded
            isFinished: false
        })).forEach(async pay2 => {
                let {
                    isCalculated,
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

                console.log(`2/ Payment for round ${_id}: Tx ${admTxId} — ${betMessageText}.`);
                if (!isCalculated) {
                    notify(`pay2.isCalculated not saved in DB yet for Tx ${admTxId} — ${betMessageText}. Need code refactoring.`, 'error');
                    return;
                }

                let msgSendBack = ``;
                let rewardsString = [];
                let newPayout;

                if(isWinner){
                    rewardPercent = weightedValueUsd / totalWinnersWeightedPoolUsd;
                    payoutValueADM = rewardPercent * rewardPoolADM;
                    payoutValueETH = rewardPercent * rewardPoolETH;
                    payoutValueUsd = rewardPercent * rewardPoolUsd;

                    await pay2.update({
                        rewardPercent,
                        payoutValueADM,
                        payoutValueETH,
                        payoutValueUsd
                    }, true);	
    
                    log.log('cr');
                    log.log(cr);
                    log.log('pay2');
                    log.log(pay2);

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
                                triesValidateCounter: 0,
                                betRound: pay2.betRound,
                                winBet: winBet,
                                accuracyKoef: pay2.accuracyKoef,
                                earlyBetKoef: pay2.earlyBetKoef,
                                calcDate: Date.now(),
                                senderKvsOutAddress: pay2[senderKvsFieldName],
                                betMessageText: pay2.betMessageText,
                                outCurrency: coin,
                                outAmount: +(pay2[payoutValueFieldName].toFixed(8)),
                                outAmountF: $u.thousandSeparator(+(pay2[payoutValueFieldName].toFixed(8)), false),
                                outAmountUsd: Store.cryptoConvert(coin, 'USD', pay2[payoutValueFieldName]),
                                outAmountUsdF: $u.thousandSeparator(Store.cryptoConvert(coin, 'USD', pay2[payoutValueFieldName])),
                                outTxid: null,
                                needHumanCheck: null
                            });

                            await newPayout.save();	
                        };
                    });
                    
                    msgSendBack = `**Bingo!** Your bet of ${betMessageText} won! Actual rate is _${$u.thousandSeparator(winBet, false)}_ USD, accuracy coef — _${accuracyKoef.toFixed(2)}_. Early bet coef is _${earlyBetKoef.toFixed(2)}_.`;
                    msgSendBack += `

Rewards are: ${rewardsString.join(', ')} (_~${$u.thousandSeparator(payoutValueUsd.toFixed(2), false)} USD_ at time of bets placed).`; 
                    msgSendBack += ` I will send these funds soon, please be patient. Wish you luck next rounds!`;

                } else { // if isWinner === false
                    msgSendBack = `D'oh! Your bet of ${betMessageText} lose. Actual rate is _${$u.thousandSeparator(winBet, false)}_ USD. Wish you luck next rounds!`;
                }
                
                let logString = '';
                logString = `Round ${_id} results for ${senderId} / ${admTxId}: ${isWinner}.`;
                logString += ` Actual rate: ${$u.thousandSeparator(winBet, false)} USD, accuracy coef: ${accuracyKoef.toFixed(2)}, Early bet coef: ${earlyBetKoef.toFixed(2)}.`;
                if(pay2.isWinner){
                    logString += ` Rewards are: ${rewardsString.join(', ')} (~${$u.thousandSeparator(payoutValueUsd.toFixed(2), false)} USD at time of bets placed).`;
                }	
                logString += ` Bet message text: ${betMessageText}.`;

                log.info(logString);
                $u.sendAdmMsg(senderId, msgSendBack);

                isFinished = true;
                await pay2.update({
                    isFinished
                }, true);	
            });

            calcWinnersDate = Date.now();
            await cr.update({
                calcWinnersDate
            }, true);

        } catch (e) {
        log.error('Error in calcWinners module: ' + e);
    }
	});

	rewardsPayer();
}

setInterval(() => {
	module.exports();
}, 60 * 1000);
