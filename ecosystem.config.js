require('dotenv').config();
const SERVICE_NAME = process.env.SERVICE_NAME || "casper-validator-metrics";

module.exports = {
  apps: [{
    name: SERVICE_NAME,
    script: "./server.js",
    watch: true,
    env: {
      LS_SERVICE_NAME: SERVICE_NAME
    }
  }]
}
