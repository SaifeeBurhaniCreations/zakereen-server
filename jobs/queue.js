const fs = require('fs').promises;
const path = require('path');

class JobQueue {
    constructor() {
        this.queue = [];
        this.isRunning = false;
        this.failedJobsFile = path.join(__dirname, 'failedJobs.json');
        this.init();
    }

    async init() {
        try {
            await fs.access(this.failedJobsFile);
            const failed = JSON.parse(await fs.readFile(this.failedJobsFile, 'utf8'));
            for (const job of failed) {
                this.add(job.fn, job.priority, job.retryCount || 0);
            }
        } catch (err) {
            // If file doesn't exist, ignore
        }
    }

    add(fn, priority = 0, retryCount = 0) {
        this.queue.push({ fn, priority, retryCount });
        this.queue.sort((a, b) => b.priority - a.priority);
        this.run();
    }

    async run() {
        if (this.isRunning || this.queue.length === 0) return;
        this.isRunning = true;

        while (this.queue.length > 0) {
            const job = this.queue.shift();
            try {
                await job.fn();
            } catch (err) {
                console.error('Job failed:', err);
                if (job.retryCount < 3) {
                    console.log('Retrying job in 30s...');
                    setTimeout(() => this.add(job.fn, job.priority, job.retryCount + 1), 30000);
                } else {
                    console.error('Job permanently failed, saving to failedJobs.json');
                    await this.saveFailedJob(job);
                }
            }
        }

        this.isRunning = false;
    }

    async saveFailedJob(job) {
        let failed = [];
        try {
            await fs.access(this.failedJobsFile);
            failed = JSON.parse(await fs.readFile(this.failedJobsFile, 'utf8'));
        } catch (err) {
            // File doesn't exist, start with empty array
        }
        failed.push(job);
        await fs.writeFile(this.failedJobsFile, JSON.stringify(failed, null, 2), 'utf8');
    }
}

module.exports = new JobQueue();
