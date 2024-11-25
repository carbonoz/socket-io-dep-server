import express from 'express'
import { createServer } from 'http'
import { scheduleJob } from 'node-schedule'
import WebSocket from 'ws'
import { connectDatabase, disconnectDatabase, prisma } from './config/db'
import { redisClient } from './config/redis.db'
import { saveToMongoDb } from './utils/mongo'
import { getMeanValues, saveToRedis } from './utils/redis'

const app = express()
const server = createServer(app)

const server1Url = 'https://broker.carbonoz.com:8000'
// const server1Url = 'ws://localhost:8000'

const reconnectDelay = 5000 // Delay in milliseconds for reconnection

const connectWebSocket = () => {
  const ws = new WebSocket(server1Url)

  ws.on('open', () => {
    console.log('Connected to WebSocket Server 1')

    ws.on('message', (message) => {
      const messageString = message?.toString()
      try {
        // Handle message parsing
      } catch (error) {
        console.error('Error parsing message:', error)
      }
    })

    ws.on('close', () => {
      console.log('WebSocket connection closed, attempting to reconnect...')
      setTimeout(connectWebSocket, reconnectDelay)
    })

    ws.on('error', (err) => {
      console.error('WebSocket Error:', err.message)
      console.error('Error Details:', err)
      // Don't kill the app on WebSocket error, just log and reconnect
    })
  })

  ws.on('error', (err) => {
    console.error('WebSocket connection failed:', err.message)
    setTimeout(connectWebSocket, reconnectDelay)
  })
}

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

connectWebSocket()

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
