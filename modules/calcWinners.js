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

        let infoString = `Calculating rewards for round ${_id}. Date is ${moment(Date.now()).format('YYYY/MM/DD HH:mm Z')} (${+Date.now()}).`;
        infoString += ` Round created: ${moment(createDate).format('YYYY/MM/DD HH:mm Z')}. Duration: ${$u.timeDiffDaysHoursMins(duration)}.`;
        infoString += ` Round end date: ${moment(endDate).format('YYYY/MM/DD HH:mm Z')}. Full round duration: ${$u.timeDiffDaysHoursMins(fullRoundDuration)}.`;
        log.info(infoString);

        const {paymentsDb} = db;
        (await paymentsDb.find({
            betRound: _id,
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

                if(isWinner){
                    rewardPercent = weightedValueUsd / totalWinnersWeightedPoolUsd;
                    payoutValueADM = rewardPercent * rewardPoolADM;
                    payoutValueETH = rewardPercent * rewardPoolETH;
                    payoutValueUsd = rewardPercent * rewardPoolUsd;
                }

                isCalculated = true;
                await pay2.update({
                    isCalculated,
                    rewardPercent,
                    payoutValueADM,
                    payoutValueETH,
                    payoutValueUsd
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

}

setInterval(() => {
	module.exports();
}, 60 * 1000);
