import { Schema, model } from 'mongoose';

import { encryptPassword } from '../src/helpers/common.js';

const schema = new Schema({
  email: { type: String },
  type: Object,
  password: {
    type: Object,
    iv: { type: String },
    content: { type: String }
  },
  platform: { type: String }
}, {
  timestamps: true,
  strict: false
});

schema.pre('save', function (next) {
  this.password = encryptPassword(this.password);
  console.log({
    password: this.password
  })

  next();
});

const Account = model('Account', schema, 'Accounts');

export default Account;
