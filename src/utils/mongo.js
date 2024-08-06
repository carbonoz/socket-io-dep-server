import { prisma } from '../config/db'
import { getMeanValues } from './redis'

export const saveToMongoDb = async () => {
  try {
    const data = await getMeanValues()
    await Promise.all(
      data.map(async (values) => {
        const {
          date,
          userId,
          pvPowerMean: pvPower,
          loadPowerMean: loadPower,
          gridIn,
          gridOut,
          batteryCharged,
          batteryDischarged,
        } = values
        await prisma.totalEnergy.upsert({
          where: { date, userId },
          update: { pvPower, loadPower },
          create: { date, pvPower, loadPower, userId },
        })
      })
    )
  } catch (error) {
    console.error('Error saving data:', error)
  }
}
