const express = require('express')
const app = express();
const path = require('path')
const cors = require('cors')
const routes = require('./config/allRoutes')
const userClient = require('./models/users')
const cron = require('node-cron');
const { enqueueStartOccasions, enqueueEndOccasions } = require('./jobs/occasionJobs');
const { initializeSocket } = require("./config/socket");

app.use(express.json());
app.use(express.static(path.join(__dirname, 'assets')))
app.use(express.urlencoded({ extended : true }))
app.use(cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allow required methods
    allowedHeaders: ['Content-Type', 'Authorization'] // Allow required headers
}));

app.get("/all", async (req, res) => {
    const user = await userClient.find()
    res.status(200).json(user)
})

app.use(routes)

// Schedule jobs
cron.schedule('*/5 * * * *', enqueueStartOccasions); // Every 5 min
cron.schedule('*/10 * * * *', enqueueEndOccasions);  // Every 10 min


const port = process.env.PORT || 8080
const server = app.listen(port, ()=>{
    console.log(`Server is running on : ${port}`)
})

initializeSocket(server);
