import { promisify } from 'util'
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

export const saveMeanToRedis = async (
  date,
  userId,
  pvPowerMean,
  loadPowerMean
) => {
  try {
    const concatenatedValues = `${pvPowerMean},${userId},${loadPowerMean}`
    await hsetAsync('mean_power_values', date, concatenatedValues)
  } catch (error) {
    throw new Error('Error saving mean values to Redis: ' + error)
  }
}

export const getMeanValues = async () => {
  try {
    const dates = await hkeysAsync('mean_power_values')
    const meanValues = []
    for (const date of dates) {
      const concatenatedValues = await hgetAsync('mean_power_values', date)
      const [pvPowerMean,userId, loadPowerMean] = concatenatedValues.split(',')
      meanValues.push({
        date: date,
        userId,
        pvPowerMean: parseFloat(pvPowerMean),
        loadPowerMean: parseFloat(loadPowerMean),
      })
    }
    return meanValues
  } catch (error) {
    console.log('Error retrieving mean values from Redis: ' + error)
  }
}
