import { getMeanValues } from './redis'

export const saveToMongoDb = async () => {
  try {
    await getMeanValues()
  } catch (error) {
    console.error('Error saving data:', error)
  }
}
