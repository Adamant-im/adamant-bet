ADAMANT Bet Bot is an incredible anonymous and Blockchain-proved betting software. 

Different types of betting:
* Bet on crypto rate within ± range
* Bet on maximum or minimum crypto rate during period within ± range (coming soon)
* Bet on ascending or descending crypto rate during period (coming soon)
* Bet if crypto will exceed special rate up to date (will McAfee eat his dick?) (coming soon)

Bet bots work in ADAMANT Messenger chats directly. Fully automatic, convenient. All bets are Blockchain-proved.

Read more: (coming soon).


# Installation
## Requirements
* Ubuntu 16 / Ubuntu 18 (other OS had not been tested)
* NodeJS v 8+ (already installed if you have a node on your machine)
* MongoDB ([installation instructions](https://docs.mongodb.com/manual/tutorial/install-mongodb-on-ubuntu/))

## Setup
```
su - adamant
git clone https://github.com/Adamant-im/adamant-bet
cd ./adamant-bet
npm i
```

## Pre-launch tuning
```
nano config.json
```

Parameters:
* `passPhrase` <string> The bot's secret phrase for concluding transactions. Obligatory. Bot's ADAMANT address will correspond this passPhrase.
* `node_ADM` <string, array> List of nodes for API work, obligatorily
* `node_ETH` <string, array> List of nodes for Ethereum API work, obligatorily
* `node_LSK` <string, array> List of nodes for Lisk API work, obligatorily
* `node_DOGE` <string, array> List of nodes for Doge API work, obligatorily
* `node_BTC` <string, array> List of nodes for Bitcoin API work, obligatorily
* `node_DASH` <string, array> List of nodes for Dash API work, obligatorily
* `infoservice` <string, array> List of [ADAMANT InfoServices](https://github.com/Adamant-im/adamant-currencyinfo-services) for catching exchange rates, obligatorily
* `slack` <string> Token for Slack alerts for the bot’s administrator. No alerts if not set.
* `adamant_notify` <string> ADM address for the bot’s administrator. Recommended.
* `known_crypto` <string, array> List of crytpocurrencies bot can work with. If bot will receive or request for crypto not in list, it will not process payment and notify owner. Obligatorily
* `accepted_crypto` <string, array> List of crytpocurrencies you want to accept for bet and pay rewards. If bot will receive payment in not-in-list crypto, it will try to return it. Obligatorily


//
* `exchange_fee` <float> Pecentage you take as fee for bot's service. Default is 10.
* `min_value_usd` <float> Minimum payment equivalent in USD accepted. Default is 1.
* `daily_limit_usd` <float> Daily exchange limit for one user, equivalent in USD. Default is 1000.
* `min_confirmations` <int> How many confirmations to wait before transaction counts accepted. Default is 3.
* `min_confirmations_ADM` <int> To override `min_confirmations` for specific cryptocurrency.
* `welcome_string` <string> Hi! 😊 I'm anonymous and Blockchain-proved bet bot. I accept bets on currency rates and pay rewards to winners. ℹ️ Learn more on ADAMANT’s blog or type **/help** to start betting."

## Launching
You can start the Bet Bot with the `node app` command, but it is recommended to use the process manager for this purpose.
```
pm2 start --name betbot app.js 
```

## Add Exchange Bot to cron:
```
crontab -e
```

Add string:
```
@reboot cd /home/adamant/adamant-bet && pm2 start --name betbot app.js
```

## Updating
```
su - adamant
cd ./adamant-bet
pm2 stop betbot
mv config.json config_bup.json && git pull && mv config_bup.json config.json
npm i
pm2 start --name betbot app.js 
```

