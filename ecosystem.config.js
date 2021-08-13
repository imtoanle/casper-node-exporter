module.exports = {
  apps: [{
    name: "casper-validator-metrics",
    script: "./server_init.js",
    watch: true,
    env: {
      OTEL_METRICS_EXPORTER: "none",
      OTEL_EXPORTER_OTLP_SPAN_ENDPOINT: "http://10.0.100.104:55681/v1/trace",
      LS_SERVICE_NAME: "casper-validator-metrics"
    }
  }]
}
