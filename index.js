require('dotenv').config();

const client = require('prom-client');
const express = require('express');
const app = express();
const casper = require('casper-js-sdk');

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:7777/rpc';
const VALIDATOR_PUBLIC_KEY = process.env.VALIDATOR_PUBLIC_KEY;
const PORT = process.env.PORT || 8111;

const casperClient = new casper.CasperServiceByJsonRPC(RPC_URL);

let validatorData = {
  selfStakedAmount: 0,
  delegatorStakedAmount: 0,
  totalStakedAmount: 0,
  delegationRate: 0,
  is_active: 0,
  block_local_era: 0,
  block_local_height: 0,
  build_version: 0,
  next_upgrade: 0
};

(async function requestRPC() {
  console.log("Running: " + Date.now());
  
  casperClient.getValidatorsInfo()
    .then(data => preparingBidData(data));

  casperClient.getStatus()
    .then(data => preparingNodeData(data));

  // casperClient.getLatestBlockInfo()
  //   .then(latestBlockInfo => {
  //     let currentBlockHeight = latestBlockInfo.block.header.height;
  //     let currentEra = latestBlockInfo.block.header.era_id;

  //     return casperClient.getEraInfoBySwitchBlockHeight(currentBlockHeight)
  //   })
  //   .then(data)
    
    // casperClient.getEraInfoBySwitchBlock({height: "75ede32d74694aea34cc8aa70da1a3d6c780a8022a06a5dd518e397674ab9401"}).then(data => { abc1 = data});

  setTimeout(requestRPC, 5000);
})();

// (async function requestEraInfo() {
//   console.log("Era Info: " + Date.now());
  
//   casperClient.getLatestBlockInfo()
//     .then(latestBlockInfo => {
//       let currentBlockHeight = latestBlockInfo.block.header.height;
//       return casperClient.getEraInfoBySwitchBlockHeight(currentBlockHeight)
//     })
//     .then(data)

//   setTimeout(requestEraInfo, 30000);
// })();

function preparingBidData(data) {
  try {
    let bidData = data.auction_state.bids.filter((obj) => obj.public_key == VALIDATOR_PUBLIC_KEY)[0];
    let selfStakedAmount = convertToCSPR(bidData.bid.staked_amount);
    let delegatorStakedAmount = calculateDelegatorStakedAmount(bidData);

    validatorData.selfStakedAmount = selfStakedAmount;
    validatorData.delegatorStakedAmount = delegatorStakedAmount;
    validatorData.totalStakedAmount = selfStakedAmount + delegatorStakedAmount;
    validatorData.delegationRate = bidData.bid.delegation_rate;
    validatorData.is_active = bidData.bid.inactive == false ? 1 : 0
  } catch (erro) {

  }
}

function preparingNodeData(data) {
  try {
    let lastBlock = data.last_added_block_info;

    validatorData.block_local_height = lastBlock.height;
    validatorData.block_local_era = lastBlock.era_id;
    validatorData.build_version = data.build_version;
    validatorData.next_upgrade = data.next_upgrade || 0;
  } catch (error) {

  }
}

function calculateDelegatorStakedAmount(data) {
  return data.bid.delegators.map(a => convertToCSPR(a.staked_amount)).reduce((a, b) => a + b);
}

function convertToCSPR(motes) {
  return parseInt(motes) / 1e9;
}
// async function getValidatorInfo() {
//   return await casperClient.getValidatorsInfo();
// }

// Create a Registry to register the metrics
const register = new client.Registry();

const casper_validator_self_staked_amount = new client.Gauge({
  name: 'casper_validator_self_staked_amount',
  help: 'Casper Total Validator Self Staked',
  async collect() {
    this.set(validatorData.selfStakedAmount);
  },
});

const casper_validator_delegator_staked_amount = new client.Gauge({
  name: 'casper_validator_delegator_staked_amount',
  help: 'Casper Validator Delegator Staked Amount',
  async collect() {
    this.set(validatorData.delegatorStakedAmount);
  },
});

const casper_validator_total_staked_amount = new client.Gauge({
  name: 'casper_validator_total_staked_amount',
  help: 'Casper Total Validator Total Staked Amount',
  async collect() {
    this.set(validatorData.totalStakedAmount);
  },
});

const casper_validator_delegation_rate = new client.Gauge({
  name: 'casper_validator_delegation_rate',
  help: 'Casper Validator Delegation Rate',
  async collect() {
    this.set(validatorData.delegationRate);
  },
});

const casper_validator_is_active = new client.Gauge({
  name: 'casper_validator_is_active',
  help: 'Casper Validator Is Active',
  async collect() {
    this.set(validatorData.is_active);
  },
});

const casper_validator_block_local_height = new client.Gauge({
  name: 'casper_validator_block_local_height',
  help: 'Casper Validator Block Local Height',
  async collect() {
    this.set(validatorData.block_local_height);
  },
});

const casper_validator_block_local_era = new client.Gauge({
  name: 'casper_validator_block_local_era',
  help: 'Casper Validator Block Local Era',
  async collect() {
    this.set(validatorData.block_local_era);
  },
});

const casper_validator_build_version = new client.Gauge({
  name: 'casper_validator_build_version',
  help: 'Casper Build Version',
  labelNames: ['build_version'],
  async collect() {
    this.set({ build_version: validatorData.build_version }, 1);
  },
});

const casper_validator_next_upgrade = new client.Gauge({
  name: 'casper_validator_next_upgrade',
  help: 'Casper Next Upgrade',
  async collect() {
    this.set(validatorData.next_upgrade);
  },
});

register.registerMetric(casper_validator_self_staked_amount);
register.registerMetric(casper_validator_delegator_staked_amount);
register.registerMetric(casper_validator_total_staked_amount);
register.registerMetric(casper_validator_delegation_rate);
register.registerMetric(casper_validator_is_active);
register.registerMetric(casper_validator_block_local_height);
register.registerMetric(casper_validator_block_local_era);
register.registerMetric(casper_validator_build_version);
register.registerMetric(casper_validator_next_upgrade);


app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
});

app.listen(PORT, () => console.log('Server is running on http://localhost:' + PORT +', metrics are exposed on http://localhost:' + PORT + '/metrics'));
