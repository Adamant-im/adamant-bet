const db = require('./DB');
const log = require('../helpers/log');
const $u = require('../helpers/utils');
const api = require('./api');
const config = require('./configReader');
const exchangeTxs = require('./exchangeTxs');
const commandTxs = require('./commandTxs');
const uncnounTxs = require('./uncnounTxs');

const historyTxs = {}; // catch saved txs. Defender dublicated TODO: clear uptime

module.exports = async (tx) => {
	if (historyTxs[tx.id]){
		return;
	}
	historyTxs[tx.id] = $u.unix();

	const {incomingTxsDb} = db;
	const checkedTx = await incomingTxsDb.findOne({txid: tx.id});
	if (checkedTx !== null) {
		return;
	};
	log.info(`New incoming transaction: ${tx.id}`);
	const chat = tx.asset.chat;
	const msg = api.decodeMsg(chat.message, tx.senderPublicKey, config.passPhrase, chat.own_message);

	let type = 'unknown';
	if (msg.startsWith('/')){
		type = 'command';
	} else if (msg.includes('_transaction') || tx.amount > 0){
		type = 'exchange';
	}
	const itx = new incomingTxsDb({
		txid: tx.id,
		date: $u.unix(),
		block_id: tx.blockId,
		encrypted_content: msg,
		spam: false,
		sender: tx.senderId,
		type, // command, exchange or unknown
		isProcessed: false
	});

	await itx.save();
	switch (type){
	case ('exchange'):
		exchangeTxs(itx, tx);
		break;
	case ('command'):
		commandTxs(msg);
		break;
	default:
		uncnounTxs(itx, tx);
		break;
	}
};

if (config.isDev){
	setTimeout(()=>{
		db.incomingTxsDb.db.drop();
		db.paymentsDb.db.drop();
	}, 2000);
}
// {"type":"ETH_transaction","amount":0.1,"hash":"0x96075435aa404a9cdda0edf40c07e2098435b28547c135278f5864f8398c5d7d","comments":"Testing purposes "}
