// Input: ZMQ
const zmq = require("zeromq")
const mingo = require("mingo")
const bch = require("fountainhead-core").bitcore
const bcode = require("fountainhead-core").bcode
const jq = require("fountainhead-core").bigjq
const tna = require("fountainhead-core").tna
const slpvalidate = require("slp-validate")
const BigNumber = require('bignumber.js')
const slpaddrjs = require('bchaddrjs-slp');
const util = require('util');
const defaults = { host: "127.0.0.1", port: 28339 }


const buffer_to_sna = async function(buf) {
    let tx = new bch.Transaction(buf);
    let o =  await tna.fromGene(tx);
    for (let m of o.in) {
      if (m.e.hasOwnProperty('a')) {
        m.e.a = slpaddrjs.toSlpAddress(m.e.a);
      }
    }
    for (let m of o.out) {
      if (m.e.hasOwnProperty('a')) {
        m.e.a = slpaddrjs.toSlpAddress(m.e.a);
      }
    }
    let slp = slpvalidate.Slp.parseSlpOutputScript(tx.outputs[0].script.toBuffer());
    if (slp.hasOwnProperty('sendOutputs')) {
        slp.outputs = slp.sendOutputs.slice(1).map((v, i) => {
          let addr = null;
          if (o.out.length > i+1) {
            if (o.out[i+1].hasOwnProperty("e")) {
              if (o.out[i+1].e.hasOwnProperty("a")) {
                addr = o.out[i+1].e.a;
              }
            }
          }
          return {
            address: addr,
            amount: v.toString()
          }
        });
        delete slp.sendOutputs;
    }
    if (slp.hasOwnProperty('genesisOrMintQuantity')) {
        slp.genesisOrMintQuantity = slp.genesisOrMintQuantity.toString();
    }

    o.slp = {
	valid: true,
	detail: slp,
    };

    return o;
}

const init = function(config) {
  let sock = zmq.socket("sub")
  let host = (config.host ? config.host : defaults.host)
  let port = (config.port ? config.port : defaults.port)
  let connections = config.connections
  sock.connect("tcp://" + host + ":" + port)
  sock.subscribe("rawtx")
  sock.subscribe("rawblock")
  sock.on("message", async function(topic, message) {
    let type = topic.toString()
    if (type == "rawtx")    type = "mempool";
    if (type == "rawblock") type = "block";
    let o = null;
    if (type == "mempool") {
        o = await buffer_to_sna(message);
        console.log(util.inspect(o, {depth: 10}));
        if (config.verbose) {
          console.log(message);
        }
    }

    if (type == "block") {
      let block = new bch.Block(message);
      let txs = [];
      for (const tx of block.transactions) {
        txs.push(await buffer_to_sna(tx.toBuffer()));
      }
      o = {header: block.header, txns: txs};
     //  console.log(util.inspect(o, {depth: 10}));
      if (config.verbose) {
        console.log(message);
      }
    }
    // TODO change this to be more efficient when schema finalized
    function convert_numberdecimal_to_string(o) {
      for (const i in o) {
        if (o[i] !== null && typeof(o[i]) === "object") {
          if (o[i].hasOwnProperty('$numberDecimal')) {
            o[i] = new BigNumber(o[i]['$numberDecimal'].toString()).toFixed()
          }
          convert_numberdecimal_to_string(o[i])
        }
      }
    }
    switch (type) {
      case "mempool": {
        let tx = o;
        // console.log(tx)
        Object.keys(connections.pool).forEach(async function(key) {
          let connection = connections.pool[key]
          const encoded = bcode.encode(connection.query)
          const types = encoded.q.db
          if (!types || types.indexOf("u") >= 0) {
            let filter = new mingo.Query(encoded.q.find)
            if (filter.test(tx)) {
              let decoded = bcode.decode(tx)
              convert_numberdecimal_to_string(decoded)
              let result
              try {
                if (encoded.r && encoded.r.f) {
                  result = await jq.run(encoded.r.f, [decoded])
                } else {
                  result = [decoded]
                }
              } catch (e) {
                console.log("Error", e)
              }
              connection.res.sseSend({ type: type, data: result })
            }
          }
        })
        break
      }
      case "block": {
        let block = o
        console.log(block)
        Object.keys(connections.pool).forEach(async function(key) {
          let connection = connections.pool[key]
          const encoded = bcode.encode(connection.query)
          // console.log(encoded)
          const types = encoded.q.db
          if (!types || types.indexOf("c") >= 0) {
            let filter = new mingo.Query(encoded.q.find)
            let filtered = block.txns.filter(function(tx) {
              return filter.test(tx)
            })
            let transformed = []
            for(let i=0; i<filtered.length; i++) {
              let tx = filtered[i]
              let decoded = bcode.decode(tx)
              convert_numberdecimal_to_string(decoded)
              let result
              try {
                if (encoded.r && encoded.r.f) {
                  result = await jq.run(encoded.r.f, [decoded])
                } else {
                  result = decoded
                }
                transformed.push(result)
              } catch (e) {
                console.log("Error", e)
              }
            }
            connection.res.sseSend({
              type: type, header: block.header, data: transformed
            })
          }
        })
        break
      }
    }
  })
}
module.exports = { init: init }
