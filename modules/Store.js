const db = require('./DB');
const log = require('../helpers/log');
const keys = require('adamant-api/helpers/keys');
const api = require('./api');
const {version} = require('../package.json');
const config = require('./configReader');
const AdmKeysPair = keys.createKeypairFromPassPhrase(config.passPhrase);
const AdmAddress = keys.createAddressFromPublicKey(AdmKeysPair.publicKey);
const ethData = api.eth.keys(config.passPhrase);

module.exports = {
	version,
	round: null,
	botName: AdmAddress,
	user: {
		ADM: {
			passPhrase: config.passPhrase,
			keysPair: AdmKeysPair,
			address: AdmAddress
		},
		ETH: {
			address: ethData.address,
			privateKey: ethData.privateKey,
		}
	},
	comissions: {
		DOGE: 1,
		LSK: 0.1,
		DASH: 0.0001,
		ADM: 0.5,
		ETH: 0.0001 // This is a stub. Ether fee returned with FEE() method in separate module
	},
	lastBlock: null,
	get lastHeight() {
		return this.lastBlock && this.lastBlock.height || false;
	},
	updateSystem(field, data) {
		const $set = {};
		$set[field] = data;
		db.systemDb.db.updateOne({}, {$set}, {upsert: true});
		this[field] = data;
	},
	async updateLastBlock() {
		try {
			const lastBlock = (await api.get('uri', 'blocks')).blocks[0];
			this.updateSystem('lastBlock', lastBlock);
		} catch (e) {
			log.error('Error while updating lastBlock: ' + e);
		}
	},
	async updateCurrencies(){
		try {
			const data = await api.syncGet(config.infoservice + '/get', true);
			if (data.success){
				this.currencies = data.result;
			}
		} catch (e){
			log.error('Error while updating currencies: ' + e);
		};
	},
	getPrice(from, to){
		try {
			from = from.toUpperCase();
			to = to.toUpperCase();
			return + (this.currencies[from + '/' + to] || 1 / this.currencies[to + '/' + from] || 0).toFixed(8);
		} catch (e){
			log.error('Error while calculating getPrice(): ', e);
			return 0;
		}
	},
	cryptoConvert(from, to, amount){
		let price = this.getPrice(from, to);
		if (!price){
			return 0;
		}
		price = +price.toFixed(8);
		return +(price * amount).toFixed(8);
	}
};

module.exports.updateCurrencies();

setInterval(() => {
	module.exports.updateCurrencies();
}, 60 * 1000);

