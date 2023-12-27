const express = require('express');
const http = require('http');
const socketIOClient = require('socket.io-client');
const Promise = require('bluebird');
const redis = Promise.promisifyAll(require('redis'));
const { promisify } = require('util');


const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

const server1Url = 'http://192.168.160.155';

const redisClient = redis.createClient({ legacyMode: true });

const lpushAsync = promisify(redisClient.lPush).bind(redisClient);
const lrangeAsync = promisify(redisClient.lRange).bind(redisClient);

redisClient
  .connect()
  .then(() => {
    console.log('Redis ok');
  })
  .catch((err) => console.log({ err }));

redisClient.on('connect', () => console.log('Redis Client Connected'));
redisClient.on('error', (err) => {
  console.log('Redis Client Connection Error', err);
});

const socket = socketIOClient(server1Url);

socket.on('connect', () => {
  console.log('Connected to Server 1.');
  socket.emit('message', 'Hello from Socket.IO client!');

  socket.on('mqttMessage', ({ topic, message }) => {
    let data = {
      topic,
      message,
    };
    const uniqueKey = `mqttData`; // List key for MQTT data
    const value = JSON.stringify(data);
    lpushAsync(uniqueKey, value)
      .then(() => {
        console.log('MQTT data saved to Redis List.');
      })
      .catch((err) => {
        console.error('Error saving MQTT data to Redis:', err);
      });
  });
});

app.get('/', async (req, res) => {
  try {
    const uniqueKey = `mqttData`;
    const messageList = await lrangeAsync(uniqueKey, 0, -1);
    const results = messageList.map((message) => JSON.parse(message));
    res.json({ results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const startServer = async () => {
  server.listen(3000);
  console.log('Express.js server listening on port 3000');
};

startServer();

