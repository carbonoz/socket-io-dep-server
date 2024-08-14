import express from 'express'
import { createServer } from 'http'
import socketIOClient from 'socket.io-client'
import { connectDatabase, disconnectDatabase, prisma } from './config/db'
import { redisClient } from './config/redis.db'
import { getMeanValues, saveMeanToRedis } from './utils/redis'
import { saveToMongoDb } from './utils/mongo'
import { findMeanOfPowerTopicsNew } from './utils/data'
import { scheduleJob } from 'node-schedule'

const app = express()
const server = createServer(app)

const server1Url = 'http://192.168.160.55:7100'

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

const socket = socketIOClient(server1Url, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 5000,
  timeout: 10000,
})

socket.on('connect_error', (err) => {
  console.error('Connection Error:', err.message)
  console.error('Error Details:', err)
})

socket.on('connect', (so) => {
  console.log('Connected to Server 1.')
  socket.on(
    'mqttMessage',
    ({
      pv,
      load,
      userId,
      date,
      gridIn,
      gridOut,
      batteryCharged,
      batteryDischarged,
    }) => {
      saveMeanToRedis(
        date,
        userId,
        pv,
        load,
        gridIn,
        gridOut,
        batteryCharged,
        batteryDischarged
      )
        .then(() => {})
        .catch((error) => {
          console.error(`Error saving mean values for ${date}:`, error)
        })
    }
  )
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
    console.log(`server listening on port ${PORT}`)
  })
}

scheduleJob('*/2 * * * *', saveToMongoDb)

startServer().catch(console.error)

process.on('SIGINT', async () => {
  await disconnectDatabase()
  process.exit(0)
})
