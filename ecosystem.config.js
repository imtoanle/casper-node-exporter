require('dotenv').config();
const SERVICE_NAME = process.env.SERVICE_NAME || "casper-validator-metrics";
const OTEL_ENDPOINT = process.env.OTEL_ENDPOINT || "http://127.0.0.1:55681/v1/trace";

module.exports = {
  apps: [{
    name: SERVICE_NAME,
    script: "./server_init.js",
    watch: true,
    env: {
      OTEL_METRICS_EXPORTER: "none",
      OTEL_EXPORTER_OTLP_SPAN_ENDPOINT: OTEL_ENDPOINT,
      LS_SERVICE_NAME: SERVICE_NAME
    }
  }]
}
