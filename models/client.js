import { Schema, model } from 'mongoose';

const schema = new Schema({
  collectionId: { type: String },
  galleryName: { type: String },
  userEmail: { type: String },
  name: { type: String },
  email: { type: String },
}, {
  timestamps: true,
  strict: false
});

const Client = model('Client', schema, 'Clients');

export default Client;

