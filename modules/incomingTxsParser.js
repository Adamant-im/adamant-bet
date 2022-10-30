const db = require('./DB');
const log = require('../helpers/log');
const api = require('./api');
const helpers = require('../helpers/utils');
const config = require('./configReader');
const betTxs = require('./betTxs');
const commandTxs = require('./commandTxs');
const unknownTxs = require('./unknownTxs');
const notify = require('../helpers/notify');

const historyTxs = {};

module.exports = async (tx) => {
  if (!tx) {
    return;
  }

  if (historyTxs[tx.id]) { // do not process one tx twice
    return;
  }

  const {IncomingTxsDb} = db;
  const checkedTx = await IncomingTxsDb.findOne({txid: tx.id});
  if (checkedTx !== null) {
    return;
  }

  log.log(`Processing new incoming transaction ${tx.id} from ${tx.senderId} via ${tx.height ? 'REST' : 'socket'}…`);

  let msg = '';
  const chat = tx.asset.chat;
  if (chat) {
    msg = api.decodeMsg(chat.message, tx.senderPublicKey, config.passPhrase, chat.own_message).trim();
  }

  if (msg === '') {
    msg = 'NONE';
  }


  let type = 'unknown';
  if (msg.includes('_transaction') || tx.amount > 0) {
    type = 'bet';
  } else if (msg.startsWith('/')) {
    type = 'command';
  }

  // Check if we should notify about spammer, only once per 24 hours
  const spamerIsNotify = await IncomingTxsDb.findOne({
    sender: tx.senderId,
    isSpam: true,
    date: {$gt: (helpers.unix() - 24 * 3600 * 1000)}, // last 24h
  });

  const itx = new IncomingTxsDb({
    _id: tx.id,
    txid: tx.id,
    date: helpers.unix(),
    block_id: tx.blockId,
    txTimestamp: tx.timestamp,
    encrypted_content: msg,
    spam: false,
    sender: tx.senderId,
    type, // command, bet or unknown
    isProcessed: false,
    isNonAdmin: false,
  });

  if (msg.toLowerCase().trim() === 'deposit') {
    itx.update({isProcessed: true}, true);
    historyTxs[tx.id] = helpers.unix();
    return;
  }

  const countRequestsUser = (await IncomingTxsDb.find({
    sender: tx.senderId,
    date: {$gt: (helpers.unix() - 24 * 3600 * 1000)}, // last 24h
  })).length;

  if (countRequestsUser > 50 || spamerIsNotify) { // 50 per 24h is a limit for accepting commands, otherwise user will be considered as spammer
    itx.update({
      isProcessed: true,
      isSpam: true,
    });
  }

  await itx.save();
  if (historyTxs[tx.id]) {
    return;
  }
  historyTxs[tx.id] = helpers.unix();

  if (itx.isSpam && !spamerIsNotify) {
    notify(`${config.notifyName} notifies _${tx.senderId}_ is a spammer or talks too much. Income ADAMANT Tx: https://explorer.adamant.im/tx/${tx.id}.`, 'warn');
    const msgSendBack = `I’ve _banned_ you. You’ve sent too much transactions to me.`;
    await api.sendMessageWithLog(config.passPhrase, tx.senderId, msgSendBack);
    return;
  }

  switch (type) {
    case ('bet'):
      betTxs(itx, tx);
      break;
    case ('command'):
      commandTxs(msg, tx, itx);
      break;
    default:
      unknownTxs(tx, itx);
      break;
  }
};
