const occassionClient = require('../models/occassion');
const jobQueue = require('./queue');

async function startOccasions() {
    const now = new Date();
    const result = await occassionClient.updateMany(
        { status: 'pending', start_at: { $lte: now }, ends_at: { $gt: now } },
        { $set: { status: 'started', updatedat: now } }
    );
    if (result.modifiedCount > 0) {
        console.log(`✅ Started ${result.modifiedCount} occasions at ${now.toISOString()}`);
    }
}

async function endOccasions() {
    const now = new Date();
    const result = await occassionClient.updateMany(
        { status: 'pending', ends_at: { $lte: now } },
        { $set: { status: 'ended', updatedat: now } }
    );
    if (result.modifiedCount > 0) {
        console.log(`✅ Ended ${result.modifiedCount} occasions at ${now.toISOString()}`);
    }
}

// Wrap functions to enqueue jobs with priority
function enqueueStartOccasions() {
    jobQueue.add(startOccasions, 1); // high priority
}
function enqueueEndOccasions() {
    jobQueue.add(endOccasions, 0);   // normal priority
}

module.exports = { enqueueStartOccasions, enqueueEndOccasions };
