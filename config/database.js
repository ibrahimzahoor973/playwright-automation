import { connect } from 'mongoose';

const { MONGO_URL } = process.env;

console.log({ MONGO_URL });
const option = {
  socketTimeoutMS: 60000,
  connectTimeoutMS: 60000
};
connect(
  MONGO_URL,
  option
).then(async (db) => {
  console.log('MongoDB Connected');
}).catch(err => console.log('MongoDB::', err));
