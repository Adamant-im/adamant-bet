const jsonminify = require('jsonminify');
const fs = require('fs');
const keys = require('adamant-api/src/helpers/keys');
const isDev = process.argv.includes('dev');
let config = {};

// Validate config fields
const fields = {
  passPhrase: {
    type: String,
    isRequired: true,
  },
  node_ADM: {
    type: Array,
    isRequired: true,
  },
  node_ETH: {
    type: Array,
    isRequired: true,
  },
  node_LSK: {
    type: Array,
    isRequired: true,
  },
  service_LSK: {
    type: Array,
    isRequired: true,
  },
  accepted_crypto: {
    type: Array,
    isRequired: true,
  },
  known_crypto: {
    type: Array,
    isRequired: true,
  },
  socket: {
    type: Boolean,
    default: true,
  },
  ws_type: {
    type: String,
    isRequired: true,
  },
  infoservice: {
    type: Array,
    default: ['https://info.adamant.im'],
  },
  cryptocompareApiKey: {
    type: String,
    isRequired: true,
  },
  min_value_usd: {
    type: Number,
    default: 0.1,
  },
  win_price_range: {
    type: Number,
    default: 50,
  },
  get_current_bets_price_ADM: {
    type: Number,
    default: 5,
  },
  bet_currency: {
    type: String,
    isRequired: true,
  },
  bet_period_cron_pattern: {
    type: String,
    isRequired: true,
  },
  cool_period_hours: {
    type: Number,
    default: 24,
  },
  daily_limit_usd: {
    type: Number,
    default: 1000,
  },
  min_confirmations: {
    type: Number,
    default: 3,
  },
  bureau_reward_percent: {
    type: Number,
    default: 20,
  },
  adamant_notify: {
    type: String,
    default: null,
  },
  slack: {
    type: String,
    default: null,
  },
  welcome_string: {
    type: String,
    default: 'Hello 😊.',
  },
  log_level: {
    type: String,
    default: 'log',
  },
};

try {
  let configFile;
  if (isDev || process.env.JEST_WORKER_ID) {
    configFile = './config.test.jsonc';
  } else {
    if (fs.existsSync('./config.jsonc')) {
      configFile = './config.jsonc';
    } else if (fs.existsSync('./config.json')) {
      configFile = './config.json';
    } else {
      configFile = './config.default.jsonc';
    }
  }
  config = JSON.parse(jsonminify(fs.readFileSync(configFile, 'utf-8')));

  if (!config.node_ADM) {
    exit(`Bot's config is wrong. ADM nodes are not set. Cannot start the Bot.`);
  }
  if (!config.passPhrase || config.passPhrase.length < 35) {
    exit(`Bot's config is wrong. Set an ADAMANT passPhrase to manage the Bot.`);
  }

  let keyPair;
  try {
    keyPair = keys.createKeypairFromPassPhrase(config.passPhrase);
  } catch (e) {
    exit(`Bot's config is wrong. Invalid passPhrase. Error: ${e}. Cannot start the Bot.`);
  }
  const address = keys.createAddressFromPublicKey(keyPair.publicKey);
  config.keyPair = keyPair;
  config.publicKey = keyPair.publicKey.toString('hex');
  config.address = address;
  config.notifyName = `${config.bot_name} (${config.address})`;
  config.version = require('../package.json').version;

  ['min_confirmations'].forEach((param) => {
    config.known_crypto.forEach((coin) => {
      const field = param + '_' + coin;
      config[field] = config[field] || config[param] || fields[param].default;
      if (fields[param].type !== config[field].__proto__.constructor) {
        exit(`Bet Bot ${address} config is wrong. Field type _${field}_ is not valid, expected type is _${fields[field].type.name}_. Cannot start Bot.`);
      }
    });
  });

  Object.keys(fields).forEach((f) => {
    if (config[f] === undefined) {
      if (fields[f].isRequired) {
        exit(`Bot's ${address} config is wrong. Field _${f}_ is not valid. Cannot start Bot.`);
      } else if (fields[f].default !== undefined) {
        config[f] = fields[f].default;
      }
    }
    if (config[f] !== false && fields[f].type !== config[f].__proto__.constructor) {
      exit(`Bot's ${address} config is wrong. Field type _${f}_ is not valid, expected type is _${fields[f].type.name}_. Cannot start Bot.`);
    }
  });

  console.info(`The bot ${address} successfully read the config-file '${configFile}'${isDev ? ' (dev)' : ''}.`);
} catch (e) {
  console.error('Error reading config: ' + e);
}

function exit(msg) {
  console.error(msg);
  process.exit(-1);
}
config.isDev = isDev;
module.exports = config;
