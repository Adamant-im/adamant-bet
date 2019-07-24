const moment = require('moment');
const db = require('./DB');
const config = require('./configReader');
const $u = require('../helpers/utils');
const Store = require('./Store');
const log = require('../helpers/log');
const notify = require('../helpers/notify');

module.exports = async () => {

    const {roundsDb} = db;

	(await roundsDb.find({
        createPayoutsDate: null,
		calcWinnersDate: {$ne: null},
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
                createPaymentsDate,

				winBet,
				betCurrency,
				rewardPoolUsd,
				rewardPoolADM,
				rewardPoolETH,
				totalWinnersWeightedPoolUsd
			} = cr;

        let infoString = `Creating payouts for round ${_id}. Date is ${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')} (${+Date.now()}).`;
        infoString += ` Round created: ${moment(createDate).format('YYYY/MM/DD HH:mm Z')}. Duration: ${$u.timeDiffDaysHoursMins(duration)}.`;
        infoString += ` Round end date: ${moment(endDate).format('YYYY/MM/DD HH:mm Z')}. Full round duration: ${$u.timeDiffDaysHoursMins(fullRoundDuration)}.`;
        log.info(infoString);

        const {paymentsDb} = db;
        (await paymentsDb.find({
            betRound: _id,
            isCalculated: true,
            isFinished: false
        })).forEach(async pay => {
                let {
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
                } = pay;

                console.log(`3/ Payment for round ${_id}: Tx ${admTxId} — ${betMessageText}.`);
                
                let msgSendBack = ``;
                let rewardsString = [];
                let newPayout;

                if(isWinner){
    
                    // log.log('cr');
                    // log.log(cr);
                    // log.log('pay2');
                    // log.log(pay);

                    const {rewardsPayoutsDb} = db;

                    // If no payout Tx added earlier, add it now for each of accepted coins
                    let checkedTx;
                    config.accepted_crypto.forEach(async (coin) => {
                        const senderKvsFieldName = 'senderKvs' + coin + 'Address';
                        const payoutValueFieldName = 'payoutValue' + coin;
                        rewardsString.push(`**${$u.thousandSeparator(+(pay[payoutValueFieldName].toFixed(8)), false)}** _${coin}_`);

                        checkedTx = await rewardsPayoutsDb.findOne({admTxId: pay.itxId, outCurrency: coin});
                        if (checkedTx === null) {					
                            newPayout = new rewardsPayoutsDb({
                                itxId: pay.admTxId,
                                senderId: pay.senderId,
                                isFinished: false,
                                isPaused: false,
                                triesSendCounter: 0,
                                triesValidateCounter: 0,
                                betRound: pay.betRound,
                                winBet: winBet,
                                accuracyKoef: pay.accuracyKoef,
                                earlyBetKoef: pay.earlyBetKoef,
                                calcDate: Date.now(),
                                senderKvsOutAddress: pay[senderKvsFieldName],
                                betMessageText: pay.betMessageText,
                                outCurrency: coin,
                                outAmount: +(pay[payoutValueFieldName].toFixed(8)),
                                outAmountF: $u.thousandSeparator(+(pay[payoutValueFieldName].toFixed(8)), false),
                                outAmountUsd: Store.cryptoConvert(coin, 'USD', pay[payoutValueFieldName]),
                                outAmountUsdF: $u.thousandSeparator(Store.cryptoConvert(coin, 'USD', pay[payoutValueFieldName])),
                                outTxid: null,
                                isPayoutMade: false,
                                needHumanCheck: null
                            });

                            let addressString = newPayout.senderKvsOutAddress === newPayout.senderId ? newPayout.senderKvsOutAddress : newPayout.senderKvsOutAddress + ' (' + newPayout.senderId + ')';
                            log.info(`Created reward payment of ${newPayout.outAmount} ${newPayout.outCurrency} to ${addressString} / Tx ${newPayout.itxId} (round ${newPayout.betRound}).`);
                            await newPayout.save();	
                        };
                    });
                    
                    msgSendBack = `**Bingo!** Your bet of ${betMessageText} won! Actual rate is _${$u.thousandSeparator(winBet, false)}_ USD, accuracy coef — _${accuracyKoef.toFixed(2)}_. Early bet coef is _${earlyBetKoef.toFixed(2)}_.`;
                    msgSendBack += `

Rewards are: ${rewardsString.join(', ')} (**~${$u.thousandSeparator(payoutValueUsd.toFixed(2), false)} USD** at time of bets placed).`; 
                    msgSendBack += ` I will send these funds soon, please be patient. Wish you luck next rounds!`;

                } else { // if isWinner === false
                    msgSendBack = `D'oh! Your bet of ${betMessageText} lose. Actual rate is _${$u.thousandSeparator(winBet, false)}_ USD. Wish you luck next rounds!`;
                }
                
                let logString = '';
                logString = `Round ${_id} results for ${senderId} / ${admTxId}: ${isWinner}.`;
                logString += ` Actual rate: ${$u.thousandSeparator(winBet, false)} USD, accuracy coef: ${accuracyKoef.toFixed(2)}, Early bet coef: ${earlyBetKoef.toFixed(2)}.`;
                if(pay.isWinner){
                    logString += ` Rewards are: ${rewardsString.join(', ')} (~${$u.thousandSeparator(payoutValueUsd.toFixed(2), false)} USD at time of bets placed).`;
                }	
                logString += ` Bet message text: ${betMessageText}.`;

                log.info(logString);
                $u.sendAdmMsg(senderId, msgSendBack);

                isFinished = true;
                await pay.update({
                    isFinished
                }, true);	
            });

            createPayoutsDate = Date.now();
            await cr.update({
                createPayoutsDate
            }, true);

        } catch (e) {
        log.error('Error in calcWinners module: ' + e);
    }
	});

}

setInterval(() => {
	module.exports();
}, 60 * 1000);
