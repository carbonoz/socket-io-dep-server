import { startOfDay, endOfDay } from 'date-fns'
import { promisify } from 'util'
import { prisma } from '../config/db'
import { redisClient } from '../config/redis.db'
import { formatInTimeZone } from 'date-fns-tz'

export const lpushAsync = promisify(redisClient.lPush).bind(redisClient)
export const zrangeAsync = promisify(redisClient.zRangeByScore).bind(
  redisClient
)
export const saddAsync = promisify(redisClient.sAdd).bind(redisClient)
export const smembersAsync = promisify(redisClient.sMembers).bind(redisClient)

const timeZone = 'Indian/Mauritius'

const hgetAsync = promisify(redisClient.hGet).bind(redisClient)
const hkeysAsync = promisify(redisClient.hKeys).bind(redisClient)
export const hsetAsync = promisify(redisClient.hSet).bind(redisClient)
export const hscanAsync = promisify(redisClient.hScan).bind(redisClient)
export const hdelAsync = promisify(redisClient.hDel).bind(redisClient)

export const normalizeDate = (date) => {
  const startOfDayInTimeZone = startOfDay(new Date(date))
  const formattedStartOfDay = formatInTimeZone(
    startOfDayInTimeZone,
    timeZone,
    "yyyy-MM-dd'T'HH:mm:ssXXX"
  )
  return formattedStartOfDay
}

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

const MAX_RETRIES = 3
const RETRY_DELAY = 1000 

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const upsertTotalEnergy = async (data) => {
  const {
    normalizedDate,
    userId,
    pvPowerMean,
    loadPowerMean,
    gridIn,
    gridOut,
    batteryCharged,
    batteryDischarged,
    port,
  } = data;

  try {
    const existingRecord = await prisma.totalEnergy.findUnique({
      where: {
        date_userId: { date: normalizedDate, userId },
      },
    });

    if (existingRecord) {
      await prisma.totalEnergy.update({
        where: {
          date_userId: { date: normalizedDate, userId },
        },
        data: {
          pvPower: pvPowerMean,
          loadPower: loadPowerMean,
          gridIn,
          gridOut,
          batteryCharged,
          batteryDischarged,
          port,
        },
      });
    } else {
      await prisma.totalEnergy.create({
        data: {
          date: normalizedDate,
          pvPower: pvPowerMean,
          loadPower: loadPowerMean,
          user: {
            connect: {
              id: userId,
            },
          },
          gridIn,
          gridOut,
          batteryCharged,
          batteryDischarged,
          port,
        },
      });
    }
  } catch (error) {
    console.error(`Prisma error for date ${normalizedDate}:`, error.message);
    throw error; // Optionally re-throw or handle the error as needed
  }
};

const BASE_DELAY = 1000; 

const exponentialBackoff = (attempt) => BASE_DELAY * Math.pow(2, attempt);

const upsertWithRetry = async (data, attempts = 0) => {
  try {
    await upsertTotalEnergy(data);
  } catch (error) {
    if (attempts < MAX_RETRIES) {
      const delay = exponentialBackoff(attempts);
      console.error(`Retry ${attempts + 1} after ${delay}ms for date ${data.normalizedDate}:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
      await upsertWithRetry(data, attempts + 1);
    } else {
      console.error(`Max retries reached for date ${data.normalizedDate}:`, error.message);
      throw error; 
    }
  }
};


export const getMeanValues = async () => {
  try {
    const dates = await hkeysAsync('mean_power_values')
    if (!dates || dates.length === 0) {
      return
    }

    for (const date of dates) {
      try {
        const concatenatedValues = await hgetAsync('mean_power_values', date)

        if (!concatenatedValues) {
          continue 
        }

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
            port,
          ] = concatenatedValues.split(',')

          const normalizedDate = normalizeDate(date)

          await upsertWithRetry({
            normalizedDate,
            userId,
            pvPowerMean,
            loadPowerMean,
            gridIn,
            gridOut,
            batteryCharged,
            batteryDischarged,
            port,
          })
        }
      } catch (error) {
        console.error(
          `Error retrieving data from Redis for date ${date}:`,
          error.message
        )
      }
    }
  } catch (error) {
    console.error('Error retrieving dates from Redis:', error.message)
  }
}

export const deleteDataFromRedis = async () => {
  const mauritiusEndOfDay = endOfDay(new Date())
  const formattedEndOfDay = formatInTimeZone(
    mauritiusEndOfDay,
    timeZone,
    "yyyy-MM-dd'T'HH:mm:ssXXX"
  )
  try {
    await hdelAsync('mean_power_values', formattedEndOfDay)
  } catch (error) {
    console.log('Error deleting data from Redis: ' + error)
  }
}
