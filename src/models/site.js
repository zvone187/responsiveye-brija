import mongoose from 'mongoose';

import { handleDuplicateKeyError } from './error.js';

const schema = new mongoose.Schema({
  host: {
    type: String,
    required: true,
    unique: true
  },
  pages: { type: Array }
}, {
  versionKey: false,
  timestamps: true
});

schema.post('save', handleDuplicateKeyError);
schema.post('update', handleDuplicateKeyError);
schema.post('findOneAndUpdate', handleDuplicateKeyError);
schema.post('insertMany', handleDuplicateKeyError);

const Site = mongoose.model('Site', schema);

export default Site;
