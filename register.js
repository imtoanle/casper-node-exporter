const client = require('prom-client');

// Create a Registry to register the metrics
const register = new client.Registry();

const casper_validator_self_staked_amount = new client.Gauge({
  name: 'casper_validator_self_staked_amount',
  help: 'Casper Total Validator Self Staked'
});

const casper_validator_delegator_staked_amount = new client.Gauge({
  name: 'casper_validator_delegator_staked_amount',
  help: 'Casper Validator Delegator Staked Amount'
});

const casper_validator_total_staked_amount = new client.Gauge({
  name: 'casper_validator_total_staked_amount',
  help: 'Casper Total Validator Total Staked Amount'
});

const casper_validator_delegation_rate = new client.Gauge({
  name: 'casper_validator_delegation_rate',
  help: 'Casper Validator Delegation Rate'
});

const casper_validator_is_active = new client.Gauge({
  name: 'casper_validator_is_active',
  help: 'Casper Validator Is Active'
});

const casper_validator_block_local_height = new client.Gauge({
  name: 'casper_validator_block_local_height',
  help: 'Casper Validator Block Local Height'
});

const casper_validator_block_local_era = new client.Gauge({
  name: 'casper_validator_block_local_era',
  help: 'Casper Validator Block Local Era'
});

const casper_validator_build_version = new client.Gauge({
  name: 'casper_validator_build_version',
  help: 'Casper Build Version',
  labelNames: ['public_ip', 'local_ip', 'api_version', 'next_version']
});

const casper_validator_should_be_upgraded = new client.Gauge({
  name: 'casper_validator_should_be_upgraded',
  help: 'Casper Next Should Be Upgraded',
  labelNames: ['next_version']
});

const casper_validator_era_rewards = new client.Gauge({
  name: 'casper_validator_era_rewards',
  help: 'Casper Current Era Rewards',
  labelNames: ['era_id']
});

const casper_validator_relative_average_performances = new client.Gauge({
  name: 'casper_validator_relative_average_performances',
  help: 'Casper Relative Average Performances',
  labelNames: ['era_id']
});

const casper_validator_current_apr = new client.Gauge({
  name: 'casper_validator_current_apr',
  help: 'Casper Current APR'
});

const casper_validator_position = new client.Gauge({
  name: 'casper_validator_position',
  help: 'Casper Validator Position'
});

const casper_validator_peers = new client.Gauge({
  name: 'casper_validator_peers',
  help: 'Casper Validator Peers'
});

register.registerMetric(casper_validator_self_staked_amount);
register.registerMetric(casper_validator_delegator_staked_amount);
register.registerMetric(casper_validator_total_staked_amount);
register.registerMetric(casper_validator_delegation_rate);
register.registerMetric(casper_validator_is_active);
register.registerMetric(casper_validator_block_local_height);
register.registerMetric(casper_validator_block_local_era);
register.registerMetric(casper_validator_build_version);
register.registerMetric(casper_validator_should_be_upgraded);
register.registerMetric(casper_validator_current_apr);
register.registerMetric(casper_validator_position);
register.registerMetric(casper_validator_era_rewards);
register.registerMetric(casper_validator_relative_average_performances);
register.registerMetric(casper_validator_peers);

module.exports = {
  casper_validator_self_staked_amount,
  casper_validator_delegator_staked_amount,
  casper_validator_total_staked_amount,
  casper_validator_delegation_rate,
  casper_validator_is_active,
  casper_validator_block_local_height,
  casper_validator_block_local_era,
  casper_validator_build_version,
  casper_validator_should_be_upgraded,
  casper_validator_current_apr,
  casper_validator_position,
  casper_validator_era_rewards,
  casper_validator_relative_average_performances,
  casper_validator_peers,
  register
};
