ADAMANT Bet Bot is an incredible anonymous and Blockchain-proved betting software.

Different types of betting:

* Bet on crypto rate within ± range
* Bet on maximum or minimum crypto rate during period within ± range (coming soon)
* Bet on ascending or descending crypto rate during period (coming soon)
* Bet if crypto will exceed special rate up to date (coming soon)

Bet bots work in ADAMANT Messenger chats directly. Fully automatic, convenient. All bets are Blockchain-proved.

Read more: (coming soon).

# Installation

## Requirements

* Ubuntu 18+ (other OS had not been tested)
* NodeJS v14+
* MongoDB ([installation instructions](https://docs.mongodb.com/manual/tutorial/install-mongodb-on-ubuntu/))

## Setup

```
su - adamant
git clone https://github.com/Adamant-im/adamant-bet
cd ./adamant-bet
npm i
```

## Pre-launch tuning

The bot will use `config.jsonc` || `config.json`, if available, or `config.default.jsonc` || `config.default.json` otherwise.

```
cp config.default.jsonc config.jsonc
nano config.jsonc
```

Parameters: see comments in `config.default.jsonc`.

## Launching

You can start the Bet Bot with the `node app` command, but it is recommended to use the process manager for this purpose.

```
pm2 start --name betbot app.js 
```

## Updating

```
su - adamant
cd ./adamant-bet
pm2 stop betbot
git pull
npm i
pm2 restart betbot
```
