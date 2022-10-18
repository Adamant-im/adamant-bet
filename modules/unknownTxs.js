const api = require('./api');
const helpers = require('../helpers/utils');
const db = require('./DB');
const config = require('./configReader');

module.exports = async (tx, itx) => {
  const {IncomingTxsDb} = db;
  IncomingTxsDb.db
      .find({
        sender: tx.senderId,
        type: 'unknown',
        date: {$gt: (helpers.unix() - 24 * 3600 * 1000)}, // last 24h
      }).sort({date: -1}).toArray((err, docs) => {
        const twoHoursAgo = helpers.unix() - 2 * 3600 * 1000;
        let countMsgs = docs.length;
        if (!docs[1] || twoHoursAgo > docs[1].date) {
          countMsgs = 1;
        }

        let msg = '';
        if (countMsgs === 1) {
          msg = config.welcome_string;
        } else if (countMsgs === 2) {
          msg = 'Good in cryto rates forecasts, ha? Make a Blockachin proved bet! ℹ️ Type **/help** for instructions.';
        } else if (countMsgs === 3) {
          msg = 'ADAMANT is so much anonymous 🤪 and offers superior features. I am a bet bot and accept bets on crypto rates. Type **/help** to proceed.';
        } else if (countMsgs === 4) {
          msg = 'I see.. You just wanna talk 🗣️. I am not the best at talking.';
        } else if (countMsgs < 10) {
          msg = getRnd(0);
        } else if (countMsgs < 20) {
          msg = getRnd(1);
        } else if (countMsgs < 30) {
          msg = getRnd(2);
        } else if (countMsgs < 40) {
          msg = getRnd(3);
        } else if (countMsgs < 50) {
          msg = getRnd(4);
        } else {
          msg = getRnd(5);
        }
        api.sendMessageWithLog(config.passPhrase, tx.senderId, msg);
        itx.update({isProcessed: true}, true);
      });
};

function getRnd(collectionNum) {
  const phrases = collection[collectionNum];
  const num = Math.floor(Math.random() * phrases.length); // The maximum is exclusive and the minimum is inclusive
  return phrases[num];
}

const collection = [
  // 0 collection
  [
    'Do you wanna beer 🍺? I want to have it aslo, but now is the bet time. Do you want a reward 💰?',
    'Aaaaghr..! 😱 Check out ₿ rates with **/rates BTC** command right now!',
    'I can tell you bet rules by secret. ℹ️ Just say **/help**.',
    'I am just kiddin! 😛',
    'I’d like to work with you 🈺.',
    'Ok, let see.. What about a bet of 10 000 ADM for 1 000 000 BTC rate? 🉐',
    'ADAMANT is cool 😎, isn’t it?',
    'People do know me. I am decent. 😎 Ask somebody to confirm.',
    'I am really good 👌 at bet deal.',
    'ADAMANT is perfect 💯. Read about it on the Blog.',
    'I recommend you to read about how ADAMANT is private 🔒 and anonymous.',
    'To pick up Emoji 😄, press Win + . on Windows, Cmd + Ctrl + Space on Mac, or use keyboard on iPhone and Android.',
    'Your IP is hidden 🕵️ in ADAMANT, as all connections go through nodes, but not directly as in P2P messengers.',
    'Blockchain offers Unprecedented Privacy and Security 🔑, did you know?',
    'Wallet private keys 🔑 are in your full control in ADAMANT.',
    'Convenient. Anonymous. Reliable. Instant. Oh, it is me! 💱',
    'ADAMANT is open source, including myself 🤖. Join to make me better! 📶',
    'Do you know what is ADAMANT 2FA?',
    'ADAMANT is soooo decentralised! And private! ❤️',
    'Do you want me to accept bet with more cryptocurrenies 💱? Ask my master!',
    'Recommend ADAMANT to your friends! 🌟',
    'If I were Satoshi, I’d rebuild Bitcoin ₿ on top of ADAMANT! 😍',
  ],
  // 1 collection
  [
    'Do you know what is ‘биток’?',
    'Yeah.. my English was born in cold ❄️ Russian village. I know. But my masters are good in programming 👨‍💻.',
    'I am working for ADAMANT for some time already. I have to admit guys feed me good. 🥪',
    'I love ADAMANT 💓. The team is doing all the best.',
    'Да не барыга я! Зарабатываю как могу. 😬',
    'London is a capital of Great Britain. 🤔',
    'To pick up Emoji 😄, press Win + . on Windows, Cmd + Ctrl + Space on Mac, or use keyboard on iPhone and Android.',
    'My mama told not to talk with strangers 🤐.',
    'Are you a girl or a boy? I am comfortable with girls 👧.',
    'Have you heard ADAMANT on Binance already? ..I am not 🙃.',
    'When Binance? 😲',
    'No, no. It is not good.',
    'D’oh! 😖',
    'Как тебе блокчейн на 1С, Илон Маск? 🙃',
    'And how do you like Blockchain on 1С, Elon Musk? 🤷',
    'Type **/calc 1 BTC in USD** to see Bitcoin price.',
    'ℹ️ Just say **/help** and I am here.',
    'Say **/rates ADM** and I will tell you all ADM prices 📈',
    '😛 I am just kiddin!',
    'Can with you that the not so? 😮',
  ],
  // 2 collection
  [
    'Talk less! 🤐',
    'No, I am not. 🙅‍♂️',
    'I am not a scammer! 😠',
    'Make a bet! 🤑 Deal! Buterin will understand soon who is the daddy.',
    '🔫 Гони бабло! 💰 ..sorry for my native.',
    'Это у вас навар адский. А у меня.. это комиссия за честную работу. 😬',
    'Ландон из э капитал оф грейт брит.. блять, я перебрал.. 🤣',
    '❤️ Love is everything.',
    'Hey.. You disturb me! 💻 I am working!',
    'It seems you are good in talking 🗣️ only.',
    'OK. I better call you now 🤙',
    'I am not a motherf.. how do you know such words, little? 👿',
    'Do you know Satoshi 🤝 is my close friend?',
    'Are you programming in 1С? Try it! ПроцессорВывода = Новый ПроцессорВыводаРезультатаКомпоновкиДанныхВТабличныйДокумент;',
    '👨‍💻',
    'And how do you like Blockchain on 1С, Elon Musk?',
    'And how do you like this, Elon Musk? 😅',
    'I am quite now.',
    'I am just kiddin! 😆',
    'Can with you that the not so? 😅',
  ],
  // 3 collection
  [
    'My patience is over 😑.',
    'You want a ban I think 🤨',
    'Just give me some money! 💱',
    'I am tired of you.. ',
    'Booooooring! 💤',
    '💱 Stop talking, go working?',
    'To ADAMANT! 🥂',
    'Ща бы пивка и дернуть кого-нибудь 👯',
    'Да ну эту крипту! Пойдем гульнем лучше! 🕺🏻',
    'Хорошо, что тып арускин епо немаишь 😁 гыгыггыгыггы',
    'Try to translate this: ‘На хера мне без хера, если с хером до хера!’',
    'Do you know you can get a ban 🚫 for much talking?',
    'Try to make blockchain in 1С! 😁 It is Russian secret programming language. Google it.',
    'Onion darknet? 🤷 No, I didnt heard.',
    'Кэн виз ю зэт зэ нот соу?',
    'Yeah! Party time! 🎉',
    'Do you drink vodka? I do.',
    'Can with you that the not so? 🔥',
    'I am just kiddin! 😄',
  ],
  // 4 collection
  [
    'Shut up.. 🤐',
    'I better find another client 📱',
    'You want to be banned 🚫 for sure!',
    'Ok.. I understood. Come back tomorrow.',
    'Who is it behind you? A real Satoshi!? 😮',
    'Can with you that the not so?',
    'Do you know this code entry called ‘shit’? Check out in ADAMANT’s Github by yourself.',
    'УДОЛИЛ!!!!!!!!!1111111',
    'Some crazy guy taught me so much words to speak. Вот чо это за слово такое, таугхт? 🤦 Ёпт.',
    'Пошутили и хватит. Давайте к делу? ℹ️ Скажите **/help**, чтобы получить справку.',
    'I am here to trade, not to speak 😐',
    'While you talk, others make money.',
    'А-а-а-а-а-а! АДАМАНТ пампят! 😱',
    'Шоколотье, сомелье, залупэ.. Привет Чиверсу 🤘',
    'Делаем ставки. 🍽️ Макафи съест свой член?',
    'Ban-ban-ban.. 🚫',
    'АСТАНАВИТЕСЬ!',
    'Ё и Е — разные буквы. Не путай, инглишь-спикер!',
  ],
  // 5 collection
  [
    '🐻 and 🐂 are those who make the market.',
    'I am hungry 🍲 now. Are you with me?',
    'To ADAMANT! 🥂',
    '🍾 Happy trading!',
    'Who is it behind you? A real Satoshi!? 😮',
    'Can with you that the not so?',
    'Can you play 🎹? I do. No, I will not play for free.',
    'I would like to live in 🏝️. But reality is so cruel.',
    'Look! ADM is pumping! 🎉',
    'Do you know at my times computers were big and use floppy? 💾',
    'Hurry up! ADAMANT pump! 📈',
    'Биток уже за сотку тыщ баксов!?',
    'Давай уже к сделке. Нипонил как? Пешы **/help**.',
    'There will be time when 1 ADM = 10 BTC 🤑',
    'Try me! I can do it! 🙂',
    'Do you think Bitcoin SV is a scam?',
    'I like trading. Lets do a bargain right now! 🉐',
    'Не, ну это слишком. 🤩',
  ],
];
