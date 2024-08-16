import { startOfDay } from 'date-fns'
import { promisify } from 'util'
import { prisma } from '../config/db'
import { redisClient } from '../config/redis.db'

export const lpushAsync = promisify(redisClient.lPush).bind(redisClient)
export const zrangeAsync = promisify(redisClient.zRangeByScore).bind(
  redisClient
)
export const saddAsync = promisify(redisClient.sAdd).bind(redisClient)
export const smembersAsync = promisify(redisClient.sMembers).bind(redisClient)

const hgetAsync = promisify(redisClient.hGet).bind(redisClient)
const hkeysAsync = promisify(redisClient.hKeys).bind(redisClient)
export const hsetAsync = promisify(redisClient.hSet).bind(redisClient)
export const hscanAsync = promisify(redisClient.hScan).bind(redisClient)
export const hdelAsync = promisify(redisClient.hDel).bind(redisClient)

export const saveMeanToRedis = async (
  date,
  userId,
  pv,
  load,
  gridIn,
  gridOut,
  batteryCharged,
  batteryDischarged,
  port
) => {
  try {
    let pvPowerMean = pv
    let loadPowerMean = load
    const concatenatedValues = `${pvPowerMean},${userId},${loadPowerMean},${gridIn},${gridOut},${batteryCharged},${batteryDischarged},${port}`
    await hsetAsync('mean_power_values', date, concatenatedValues)
  } catch (error) {
    throw new Error('Error saving mean values to Redis: ' + error)
  }
}

export const getMeanValues = async () => {
  try {
    const dates = await hkeysAsync('mean_power_values')
    for (const date of dates) {
      const concatenatedValues = await hgetAsync('mean_power_values', date)
      if (
        typeof concatenatedValues === 'string' &&
        concatenatedValues.includes('[object Object]')
      ) {
        continue
      }
      if (typeof concatenatedValues === 'string') {
        const [
          pvPowerMean,
          userId,
          loadPowerMean,
          gridIn,
          gridOut,
          batteryCharged,
          batteryDischarged,
          port
        ] = concatenatedValues.split(',')
        let pvPower = pvPowerMean
        let loadPower = loadPowerMean

        const normalizedDate = startOfDay(new Date(date)).toISOString()

        await prisma.totalEnergy.upsert({
          where: {
            date_userId: { date: normalizedDate, userId },
          },
          update: {
            pvPower,
            loadPower,
            gridIn,
            gridOut,
            batteryCharged,
            batteryDischarged,
            port
          },
          create: {
            date: normalizedDate,
            pvPower,
            loadPower,
            userId,
            gridIn,
            gridOut,
            batteryCharged,
            batteryDischarged,
            port
          },
        })
      }
    }
  } catch (error) {
    console.log('Error retrieving mean values from Redis: ' + error)
  }
}

export const deleteDataFromRedis = async()=>{
  console.log('staring')
  const today = startOfDay(new Date()).toISOString()
  try {
    await hdelAsync('mean_power_values', today)
    console.log(`Data for ${today} deleted from Redis`)
  } catch (error) {
    console.log('Error deleting data from Redis: ' + error)
  }
}
