require('dotenv').config();

var metrics = require('./register');

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:7777/rpc';
const VALIDATOR_PUBLIC_KEY = process.env.VALIDATOR_PUBLIC_KEY;
const PORT = process.env.PORT || 8111;

const express = require('express');
const app = express();
const casper = require('casper-js-sdk');
const casperClient = new casper.CasperServiceByJsonRPC(RPC_URL);

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
    metrics.casper_validator_is_active.set(bidData.bid.inactive == false ? 1 : 0);
    metrics.casper_validator_position.set(findValidatorPosition(data.auction_state.bids));
  } catch (error) {
    metrics.casper_validator_is_active.set(0);
  }
}

function preparingNodeData(data) {
  try {
    let lastBlock = data.last_added_block_info;
    
    metrics.casper_validator_block_local_height.set(lastBlock.height);
    metrics.casper_validator_block_local_era.set(lastBlock.era_id);
    metrics.casper_validator_build_version.set({ build_version: data.build_version }, 1);
    metrics.casper_validator_next_upgrade.set(data.next_upgrade || 0);
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

(async function requestRPC() {
  casperClient.getValidatorsInfo()
    .then(data => preparingBidData(data));

  casperClient.getStatus()
    .then(data => preparingNodeData(data));

  setTimeout(requestRPC, 60000);
})();

(async function requestEraInfo() {
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
      }).filter(x => x != undefined).reduce((a, b) => a + b);
      
      metrics.casper_validator_current_apr.set(calculateAPR(era_rewards));
      metrics.casper_validator_era_rewards.reset();
      metrics.casper_validator_era_rewards.set({ era_id: eraInfo.eraId }, era_rewards);
    }

    currentBlockHeight--;
    await sleep(1000);
  }
  setTimeout(requestEraInfo, 60*60*1000);
})();

app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', metrics.register.contentType);
    res.send(await metrics.register.metrics());
});

app.listen(PORT, () => console.log('Server is running on http://localhost:' + PORT +', metrics are exposed on http://localhost:' + PORT + '/metrics'));
