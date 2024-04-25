import { promisifyAll } from 'bluebird'
const redis = promisifyAll(require('redis'))


const redisClient = redis.createClient({
  legacyMode: true,
  // url: `redis://192.168.160.155`,
})



export { redisClient }