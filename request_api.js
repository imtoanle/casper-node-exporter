const { parentPort, isMainThread } = require("worker_threads");

function busyWaitTime() {
  console.log("Running loop: " + Date.now());
  return 123;
}

// check that the sorter was called as a worker thread
if (!isMainThread) {
  // we post a message through the parent port, to emit the "message" event
  parentPort.postMessage(busyWaitTime());
}