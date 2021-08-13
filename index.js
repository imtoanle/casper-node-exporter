require('dotenv').config();

var metrics = require('./register');

const OUR_NODE = process.env.OUR_NODE || '127.0.0.1';
const VALIDATOR_PUBLIC_KEY = process.env.VALIDATOR_PUBLIC_KEY;
const PORT = process.env.PORT || 8111;
const KNOWN_NODES = [
  "47.251.14.254",
  "206.189.47.102",
  "134.209.243.124",
  "148.251.190.103",
  "167.172.32.44",
  OUR_NODE
];

const express = require('express');
const app = express();
const casper = require('casper-js-sdk');
const casperClient = new casper.CasperServiceByJsonRPC(`http://${OUR_NODE}:7777/rpc`);

function sleep(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}

function calculateAPR(era_rewards){
  if (metrics.casper_validator_total_staked_amount._getValue()) {
    return parseFloat((era_rewards * 12 * 365 / metrics.casper_validator_total_staked_amount._getValue() * 100).toFixed(2));
  } else { return 0; }
}

function preparingBidData(data) {
  try {
    let bidData = data.auction_state.bids.filter((obj) => obj.public_key == VALIDATOR_PUBLIC_KEY)[0];
    let selfStakedAmount = convertToCSPR(bidData.bid.staked_amount);
    let delegatorStakedAmount = calculateDelegatorStakedAmount(bidData);

    metrics.casper_validator_self_staked_amount.set(selfStakedAmount);
    metrics.casper_validator_delegator_staked_amount.set(delegatorStakedAmount);
    metrics.casper_validator_total_staked_amount.set(selfStakedAmount + delegatorStakedAmount);
    metrics.casper_validator_delegation_rate.set(bidData.bid.delegation_rate);
    metrics.casper_validator_is_active.set(isValidatorActive(bidData));
    metrics.casper_validator_position.set(findValidatorPosition(data.auction_state.bids));
  } catch (error) {
    metrics.casper_validator_is_active.set(0);
  }
}

function preparingNodeData(data) {
  try {
    let lastBlock = data.last_added_block_info;
    
    metrics.casper_validator_block_local_height.set(lastBlock.height);
    if (metrics.casper_validator_block_local_era._getValue() != lastBlock.era_id) {
      requestEraInfo();
    }
    metrics.casper_validator_block_local_era.set(lastBlock.era_id);
  } catch (error) {
    metrics.casper_validator_is_active.set(0);
  }
}

function findValidatorPosition(bidData) {
  return bidData
    .map( b => { return {publicKey: b.public_key, totalStaked: (convertToCSPR(b.bid.staked_amount) + calculateDelegatorStakedAmount(b))} })
    .sort((a, b) => b.totalStaked - a.totalStaked)
    .findIndex(a => a.publicKey == VALIDATOR_PUBLIC_KEY) + 1;
}

function calculateDelegatorStakedAmount(data) {
  return data.bid.delegators.map(a => convertToCSPR(a.staked_amount)).reduce((a, b) => a + b, 0);
}

function convertToCSPR(motes) {
  return Math.trunc(parseInt(motes) / 1e9);
}

function getLatestReward() {
  try {
    let rewardKeys = Object.keys(metrics.casper_validator_era_rewards.hashMap);
    return metrics.casper_validator_era_rewards.hashMap[rewardKeys[rewardKeys.length - 1]].value;
  } catch (error) {
    return 0;
  }
}

function isValidatorActive(bidData) {
  return (bidData.bid.inactive == false && getLatestReward() != 0) ? 1 : 0;
}

async function requestEraInfo() {
  let foundBlock = false;
  let latestBlockInfo = await casperClient.getLatestBlockInfo();
  let currentBlockHeight = latestBlockInfo.block.header.height;
  let eraInfo;

  while (!foundBlock) {
    eraInfo = await casperClient.getEraInfoBySwitchBlockHeight(currentBlockHeight);

    if (eraInfo) {
      console.log("Found Block: " + currentBlockHeight);
      foundBlock = true;

      let era_rewards = eraInfo.StoredValue.EraInfo.seigniorageAllocations.map( x => {
        if (x.Delegator && x.Delegator.validatorPublicKey == VALIDATOR_PUBLIC_KEY) {
          return convertToCSPR(x.Delegator.amount);
        } else if ((x.Validator && x.Validator.validatorPublicKey == VALIDATOR_PUBLIC_KEY)) {
          return convertToCSPR(x.Validator.amount);
        }
      }).filter(x => x != undefined).reduce((a, b) => a + b, 0);
      metrics.casper_validator_current_apr.set(calculateAPR(era_rewards));
      metrics.casper_validator_era_rewards.reset();
      metrics.casper_validator_era_rewards.set({ era_id: eraInfo.eraId }, era_rewards);
    }

    currentBlockHeight--;
    await sleep(1000);
  }
}

(async function requestRPC() {
  casperClient.getValidatorsInfo()
    .then(data => preparingBidData(data));

  casperClient.getStatus()
    .then(data => preparingNodeData(data));

  setTimeout(requestRPC, 60000);
})();

(async function checkNextUpgradeFromOtherNodes() {
  let theirVersion = null;
  let theirNextVersion = null

  KNOWN_NODES.forEach(ip => {
    let cClient = new casper.CasperServiceByJsonRPC(`http://${ip}:7777/rpc`);
    cClient.getStatus()
      .then(data => {
        theirVersion = data.api_version;

        if (data.next_upgrade) {
          metrics.casper_validator_next_upgrade.set({ node_ip: ip, next_version: data.next_upgrade.protocol_version }, 1);
          if (theirNextVersion < data.next_upgrade.protocol_version) {
            theirNextVersion = data.next_upgrade.protocol_version;
          }
        }

        if (ip == OUR_NODE) {
          if ((data.api_version != theirVersion) || (theirNextVersion && (!data.next_upgrade || data.next_upgrade.protocol_version != theirNextVersion))) {
            // Should upgrade now
            metrics.casper_validator_should_be_upgraded.set(1);
          }
        }
      });
    
    sleep(1000);
  });

  setTimeout(checkNextUpgradeFromOtherNodes, 120*60*1000);
})();

app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', metrics.register.contentType);
    res.send(await metrics.register.metrics());
});

app.listen(PORT, () => console.log('Server is running on http://localhost:' + PORT +', metrics are exposed on http://localhost:' + PORT + '/metrics'));
