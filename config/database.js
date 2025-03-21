import { connect } from 'mongoose';

const { MONGO_URL } = process.env;

console.log({ MONGO_URL });
const option = {
  maxPoolSize: 200,
  socketTimeoutMS: 120000,
  connectTimeoutMS: 120000
};
connect(
  MONGO_URL,
  option
).then(async (db) => {
  console.log('MongoDB Connected');
}).catch(err => console.log('MongoDB::', err));
