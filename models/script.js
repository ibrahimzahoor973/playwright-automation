import { Schema, model } from 'mongoose';

const schema = new Schema({
  scriptPath: { type: String },
  userEmail: { type: String },
  platform: { type: String },
  errorMessage: { type: String },
  completed: { type: Boolean },
  running: { type: Boolean }
}, {
  timestamps: true,
  strict: false
});

const Script = model('Script', schema, 'Scripts');

export default Script;
