require('dotenv').config();
const process = require('process');
const axios = require('axios').default;

var metrics = require('./register');
var validatorInfo = {
  current_version: '',
  next_version: '',
  public_ip: ''
};

const OUR_NODE = process.env.OUR_NODE || '127.0.0.1';
const VALIDATOR_PUBLIC_KEY = process.env.VALIDATOR_PUBLIC_KEY.toLowerCase();
const NODE_ID = process.env.NODE_ID;
const PORT = 8111;
const PERFORMANCE_API = process.env.PERFORMANCE_API || 'https://event-store-api-clarity-mainnet.make.services'
const OTHER_NODES = [
  "https://event-store-api-clarity-mainnet.make.services/rpc"
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

function preparingBidData(data) {
  let bidData = data.auction_state.bids.filter((obj) => obj.public_key.toLowerCase() == VALIDATOR_PUBLIC_KEY)[0];
  let selfStakedAmount = convertToCSPR(bidData.bid.staked_amount);
  let delegatorStakedAmount = calculateDelegatorStakedAmount(bidData);

  metrics.casper_validator_self_staked_amount.set(selfStakedAmount);
  metrics.casper_validator_delegator_staked_amount.set(delegatorStakedAmount);
  metrics.casper_validator_total_staked_amount.set(selfStakedAmount + delegatorStakedAmount);
  metrics.casper_validator_delegation_rate.set(bidData.bid.delegation_rate);
  metrics.casper_validator_is_active.set(isValidatorActive(bidData));
  metrics.casper_validator_position.set(findValidatorPosition(data.auction_state.era_validators));
}

function preparingNodeData(data) {
  let lastAddedBlock = data.last_added_block_info;
  
  metrics.casper_validator_block_local_height.set(lastAddedBlock.height);
  metrics.casper_validator_peers.set(data.peers.length);
  metrics.casper_validator_build_version.reset();
  metrics.casper_validator_build_version.set({ public_ip: validatorInfo.public_ip, local_ip: OUR_NODE, api_version: data.api_version, next_version: (data.next_upgrade && data.next_upgrade.protocol_version) }, 1);

  validatorInfo.current_version = data.api_version;
  validatorInfo.next_version = data.next_upgrade && data.next_upgrade.protocol_version;
  
  if (metrics.casper_validator_block_local_era._getValue() != lastAddedBlock.era_id)
    requestEraInfo();
  metrics.casper_validator_block_local_era.set(lastAddedBlock.era_id);
}

function findValidatorPosition(eraValidators) {
  return eraValidators[1].validator_weights
    .sort((a, b) => b.weight - a.weight)
    .findIndex(a => a.public_key.toLowerCase() == VALIDATOR_PUBLIC_KEY) + 1;
}

function calculateDelegatorStakedAmount(data) {
  return data.bid.delegators.map(a => convertToCSPR(a.staked_amount)).reduce((a, b) => a + b, 0);
}

function convertToCSPR(motes) {
  return parseInt(motes) / 1e9;
}

function getLatestReward() {
  try {
    let rewardKeys = Object.keys(metrics.casper_validator_era_rewards.hashMap);
    return metrics.casper_validator_era_rewards.hashMap[rewardKeys[rewardKeys.length - 1]].value;
  } catch (error) { return 0; }
}

function setAveragePerformancesMetrics(eraId) {
  axios.get(`${PERFORMANCE_API}/validators/${VALIDATOR_PUBLIC_KEY}/relative-average-performances`, {
    params: {
      page: 1,
      limit: 1,
      order_direction: 'DESC',
      era_id: eraId
    }
  })
  .then(function (response) {
    metrics.casper_validator_relative_average_performances.reset();
    metrics.casper_validator_relative_average_performances.set({ era_id: eraId }, calculatePerformances(response.data.data));
  })
  .catch(function (error) {
    console.log(error);
  });
}

function calculatePerformances(data) {
  if (data && data.length > 0) {
    return data[0].average_score;
  } else return 0;
}

function isValidatorActive(bidData) {
  return (bidData.bid.inactive == false && getLatestReward() > 0) ? 1 : 0;
}

function calculateEraRewards(eraInfo) {
  return eraInfo.StoredValue.EraInfo.seigniorageAllocations
    .map(x => x.Delegator || x.Validator)
    .filter(x => x && x.validatorPublicKey.toLowerCase() == VALIDATOR_PUBLIC_KEY)
    .map(x => convertToCSPR(x.amount))
    .reduce((a, b) => a + b, 0);
}

function calculateAPR(){
  return getLatestReward() * 12 * 365 / metrics.casper_validator_total_staked_amount._getValue() * 100;
}

function setRewardsMetrics(eraInfo) {
  let eraRewards = calculateEraRewards(eraInfo);

  metrics.casper_validator_era_rewards.reset();
  metrics.casper_validator_era_rewards.set({ era_id: eraInfo.eraId }, eraRewards);
  metrics.casper_validator_current_apr.set(calculateAPR());
}

async function requestEraInfo() {
  let eraInfo;
  let currentBlockHeight = (await casperClient.getLatestBlockInfo()).block.header.height;

  while (true) {
    eraInfo = await casperClient.getEraInfoBySwitchBlockHeight(currentBlockHeight);

    if (eraInfo) {
      setRewardsMetrics(eraInfo);
      setAveragePerformancesMetrics(eraInfo.eraId);
      return;
    }

    currentBlockHeight--;
    await sleep(1000);
  }
}

function findOurNodePublicIp(peers) {
  try {
    return peers.filter(x => x.node_id == NODE_ID)[0].address.split(':')[0];
  } catch (error) { return null; }
}

(async function requestRPC() {
  casperClient.getValidatorsInfo()
    .then(data => preparingBidData(data));

  casperClient.getStatus()
    .then(data => preparingNodeData(data));

  setTimeout(requestRPC, 60000);
})();

(async function checkNextUpgradeFromOtherNodes() {
  let otherNodeVersion = otherNodeNextVersion = '';

  for (const url of OTHER_NODES) {
    let cClient = new casper.CasperServiceByJsonRPC(url);

    await cClient.getStatus()
      .then(data => {
        validatorInfo.public_ip = findOurNodePublicIp(data.peers);

        if (data.api_version > otherNodeVersion)
          otherNodeVersion = data.api_version;
        if (data.next_upgrade && otherNodeNextVersion < data.next_upgrade.protocol_version)
          otherNodeNextVersion = data.next_upgrade.protocol_version;
      })
      .catch( e => console.log(e) );
  };

  metrics.casper_validator_should_be_upgraded.reset();
  if ((validatorInfo.current_version < otherNodeVersion) || (otherNodeNextVersion && (!validatorInfo.next_version || validatorInfo.next_version != otherNodeNextVersion))) {
    metrics.casper_validator_should_be_upgraded.set({ next_version: otherNodeNextVersion }, 1);
  } else {
    metrics.casper_validator_should_be_upgraded.set({ next_version: " " }, 0);
  }

  setTimeout(checkNextUpgradeFromOtherNodes, 10*60*1000);
})();

process.on('uncaughtException', (error, source) => {
  metrics.casper_validator_is_active.set(0);
});

app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', metrics.register.contentType);
    res.send(await metrics.register.metrics());
});

app.listen(PORT, () => console.log('Server is running on http://localhost:' + PORT +', metrics are exposed on http://localhost:' + PORT + '/metrics'));
