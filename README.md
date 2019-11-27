## What is SLPStream?

SLPStream is a frontend API for GS++ that provides a streaming output of new transactions. Unlike [slpsockserve](https://github.com/fountainhead-cash/slpsockserve), SLPStream uses GS++ to for greater efficiency.

## Installation

### Prerequisite

For SLPSockserve to work you first need to go through the install process for [gs++](https://gs.fountainhead.cash), which will continually scan the blockchain for new transactions and blocks which will be streamed live over the SLPStream API.

### Setting up SLPStream

Clone this repository:
```
git clone https://github.com/fountainhead-cash/slpstream.git && cd slpstream
```

Install dependencies:
```
npm install
```

Configure SLPStream:
```
cp .env.example .env
$(EDITOR) .env

```

Start SLPStream
```
npm start
```

### Running as a daemon

Install PM2 using NPM
```
npm install pm2 -g
```

CD to install location and run bitd
```
pm2 start index.js
```
