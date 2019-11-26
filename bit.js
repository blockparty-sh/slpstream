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
    if (type == "rawtx") {
        type = "mempool";
    } else if (type === "rawblock") {
        type = "block";
    }
    let tx = new bch.Transaction(message);
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
    o.slp = slpvalidate.Slp.parseSlpOutputScript(tx.outputs[0].script.toBuffer());
    if (o.slp.hasOwnProperty('sendOutputs')) {
        o.slp.outputs = o.slp.sendOutputs.map((v, i) => ({
          address: slpaddrjs.toSlpAddress(o.out[i+1].e.a),
          amount: v.toString()
        }));
        console.log(o.slp.outputs);
        delete o.slp.sendOutputs;
    }
    if (o.slp.hasOwnProperty('genesisOrMintQuantity')) {
        o.slp.genesisOrMintQuantity = o.slp.genesisOrMintQuantity.toString();
    }
    // console.log(util.inspect(o, {depth: 10}));
    if (config.verbose) {
      console.log(message);
    }

    switch (type) {
      case "mempool": {
        let tx = o
        Object.keys(connections.pool).forEach(async function(key) {
          let connection = connections.pool[key]
          const encoded = bcode.encode(connection.query)
          const types = encoded.q.db
          if (!types || types.indexOf("u") >= 0) {
            let filter = new mingo.Query(encoded.q.find)
            if (filter.test(tx)) {
              let decoded = bcode.decode(tx)
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
        let block = JSON.parse(o)
        console.log(block)
        Object.keys(connections.pool).forEach(async function(key) {
          let connection = connections.pool[key]
          const encoded = bcode.encode(connection.query)
          console.log(encoded)
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
              type: type, index: block.i, data: transformed 
            })
          }
        })
        break
      }
    }
  })
}
module.exports = { init: init }
