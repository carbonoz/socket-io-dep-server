import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { promisify } from 'util'
import { prisma } from '../config/db'
import { redisClient } from '../config/redis.db'

dayjs.extend(utc)
dayjs.extend(timezone)


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



const MAX_RETRIES = 3


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
  } = data

  try {
    const existingRecord = await prisma.totalEnergy.findUnique({
      where: {
        date_userId: { date: normalizedDate, userId },
      },
    })

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
      })
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
      })
    }
  } catch (error) {
    console.error(`Prisma error for date ${normalizedDate}:`, error.message)
    throw error // Optionally re-throw or handle the error as needed
  }
}

const BASE_DELAY = 1000

const exponentialBackoff = (attempt) => BASE_DELAY * Math.pow(2, attempt)

const upsertWithRetry = async (data, attempts = 0) => {
  try {
    await upsertTotalEnergy(data)
  } catch (error) {
    if (attempts < MAX_RETRIES) {
      const delay = exponentialBackoff(attempts)
      console.error(
        `Retry ${attempts + 1} after ${delay}ms for date ${
          data.normalizedDate
        }:`,
        error.message
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
      await upsertWithRetry(data, attempts + 1)
    } else {
      console.error(
        `Max retries reached for date ${data.normalizedDate}:`,
        error.message
      )
      throw error
    }
  }
}

export const getMeanValues = async () => {
  try {
    const dateUserKeys = await hkeysAsync('redis-data')
    if (!dateUserKeys || dateUserKeys.length === 0) {
      return
    }

    for (const dateUserKey of dateUserKeys) {
      try {
        const concatenatedValues = await hgetAsync('redis-data', dateUserKey)
        
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
            existingPv,
            existingUserId,
            existingLoad,
            existingGridIn,
            existingGridOut,
            existingBatteryCharged,
            existingBatteryDischarged,
          ] = concatenatedValues.split(',')

          await upsertWithRetry({
            normalizedDate: dateUserKey.split('-')[0],
            userId: existingUserId,
            pvPowerMean: existingPv,
            loadPowerMean: existingLoad,
            gridIn: existingGridIn,
            gridOut: existingGridOut,
            batteryCharged: existingBatteryCharged,
            batteryDischarged: existingBatteryDischarged,
          })
        }
      } catch (error) {
        console.error(
          `Error retrieving data from Redis for key ${dateUserKey}:`,
          error.message
        )
      }
    }
  } catch (error) {
    console.error('Error retrieving keys from Redis:', error.message)
  }
}


