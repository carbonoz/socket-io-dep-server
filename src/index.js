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

const server1Url = 'ws://192.168.160.160'

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

const ws = new WebSocket(server1Url)

ws.on('open', () => {
  console.log('Connected to WebSocket Server 1')

  ws.on('message', (message) => {
    const messageString = message?.toString()
    try {
      const data = JSON.parse(messageString)
      const { topic, message, userId } = data
      const Message = message.toString()
      saveToRedis({topic, message:Message, userId})
        .then(() => {})
        .catch((error) => {
          console.error(`Error saving mean values for ${date}:`, error)
        })
    } catch (error) {
      console.error('Error parsing message:', error)
    }
  })
})

ws.on('error', (err) => {
  console.error('WebSocket Error:', err.message)
  console.error('Error Details:', err)
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

scheduleJob('*/2 * * * *', saveToMongoDb)

startServer().catch(console.error)


process.on('SIGINT', async () => {
  await disconnectDatabase()
  process.exit(0)
})
