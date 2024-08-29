import { startOfDay, endOfDay } from 'date-fns'
import { promisify } from 'util'
import { prisma } from '../config/db'
import { redisClient } from '../config/redis.db'
import { formatInTimeZone } from 'date-fns-tz'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

const mauritiusTimezone = 'Indian/Mauritius'

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
    const dates = await hkeysAsync('redis-data')
    if (!dates || dates.length === 0) {
      return
    }

    for (const date of dates) {
      try {
        const concatenatedValues = await hgetAsync('redis-data', date)

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

          const normalizedDate = date

          await upsertWithRetry({
            normalizedDate,
            userId:existingUserId,
            pvPowerMean:existingPv,
            loadPowerMean:existingLoad,
            gridIn:existingGridIn,
            gridOut:existingGridOut,
            batteryCharged:existingBatteryCharged,
            batteryDischarged:existingBatteryDischarged,
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



export const saveToRedis = async ({ topic, message, userId }) => {
  try {
    const now = dayjs().tz('Indian/Mauritius')
    const date = now.format('YYYY-MM-DD')
    const time = now.format('HH:mm')

    // Automatically add a new entry if it's 12:00 AM Mauritius time
    if (time === '00:00') {
      await hsetAsync('redis-data', date, `0,${userId},0,0,0,0,0`)
    }

    let existingData = await hgetAsync('redis-data', date)

    let load = 0
    let pv = 0
    let gridIn = 0
    let gridOut = 0
    let batteryCharged = 0
    let batteryDischarged = 0

    if (existingData) {
      const [
        existingPv,
        existingUserId,
        existingLoad,
        existingGridIn,
        existingGridOut,
        existingBatteryCharged,
        existingBatteryDischarged,
      ] = existingData.split(',').map(parseFloat)

      load = existingLoad
      pv = existingPv
      gridIn = existingGridIn
      gridOut = existingGridOut
      batteryCharged = existingBatteryCharged
      batteryDischarged = existingBatteryDischarged
    }

    let updated = false
    switch (topic) {
      case 'solar_assistant_DEYE/total/load_energy/state':
        const newLoad = parseFloat(message)
        if (newLoad !== load) {
          load = newLoad
          updated = true
        }
        break
      case 'solar_assistant_DEYE/total/pv_energy/state':
        const newPv = parseFloat(message)
        if (newPv !== pv) {
          pv = newPv
          updated = true
        }
        break
      case 'solar_assistant_DEYE/total/battery_energy_in/state':
        const newBatteryCharged = parseFloat(message)
        if (newBatteryCharged !== batteryCharged) {
          batteryCharged = newBatteryCharged
          updated = true
        }
        break
      case 'solar_assistant_DEYE/total/battery_energy_out/state':
        const newBatteryDischarged = parseFloat(message)
        if (newBatteryDischarged !== batteryDischarged) {
          batteryDischarged = newBatteryDischarged
          updated = true
        }
        break
      case 'solar_assistant_DEYE/total/grid_energy_in/state':
        const newGridIn = parseFloat(message)
        if (newGridIn !== gridIn) {
          gridIn = newGridIn
          updated = true
        }
        break
      case 'solar_assistant_DEYE/total/grid_energy_out/state':
        const newGridOut = parseFloat(message)
        if (newGridOut !== gridOut) {
          gridOut = newGridOut
          updated = true
        }
        break
      default:
        return
    }

    if (updated || !existingData) {
      const concatenatedValues = `${pv},${userId},${load},${gridIn},${gridOut},${batteryCharged},${batteryDischarged}`
      await hsetAsync('redis-data', date, concatenatedValues)
    }
  } catch (error) {
    console.error('Error saving data to Redis:', error)
  }
}

