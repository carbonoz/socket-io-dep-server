import express from 'express'
import { createServer } from 'http'
import { scheduleJob } from 'node-schedule'
import { connectDatabase, disconnectDatabase, prisma } from './config/db'
import { redisClient } from './config/redis.db'
import { saveToMongoDb } from './utils/mongo'
import { getMeanValues } from './utils/redis'

const app = express()
const server = createServer(app)


redisClient
  .connect()
  .then(() => {
    console.log('Redis ok')
  })
  .catch((err) => console.log({ err }))

redisClient.on('connect', () => console.log('Redis Client Connected'))
redisClient.on('error', (err) => {
  console.log('Redis Client Connection Error', err)
})


app.get('/', async (req, res) => {
  try {
    const data = await getMeanValues()
    res.status(200).send(data)
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

app.get('/data', async (req, res) => {
  try {
    const result = await prisma.totalEnergy.deleteMany({})
    console.log(`Deleted ${result.count} records from TotalEnergy.`)
    res.status(200).send('All records deleted successfully.')
  } catch (error) {
    res.status(500).json({ error })
  }
})

const PORT = process.env.PORT || 7000

const startServer = async () => {
  await connectDatabase()
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`)
  })
}

// Schedule periodic tasks, e.g., saving data to MongoDB
scheduleJob('*/2 * * * *', saveToMongoDb)

startServer().catch(console.error)

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT. Gracefully shutting down...')
  await disconnectDatabase()
  process.exit(0)
})

// Global error handling to prevent the app from crashing
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message)
  console.error(err.stack)
  // Keep the app alive despite the exception
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // Keep the app alive
})
