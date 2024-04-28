import mongoose from 'mongoose';
import validator from 'validator';

import { handleDuplicateKeyError } from './error.js';

const schema = new mongoose.Schema({
  urlHost: {
    type: String,
    required: true
  },
  urlPath: {
    type: String,
  },
  email: {
    type: String,
  },
  password: {
    type: String,
  },
}, {
  versionKey: false,
  timestamps: true
});

schema.index({ urlHost:1 }, { unique: true });

schema.post('save', handleDuplicateKeyError);
schema.post('update', handleDuplicateKeyError);
schema.post('findOneAndUpdate', handleDuplicateKeyError);
schema.post('insertMany', handleDuplicateKeyError);

const Loginpage = mongoose.model('LoginPage', schema);

export default Loginpage;
