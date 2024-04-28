import mongoose from 'mongoose';

import { handleDuplicateKeyError } from './error.js';

const schema = new mongoose.Schema({
  urlHost: {
    type: String,
    required: true
  },
  urlPath: {
    type: String
  },
  status: {
    type: String,
    default: 'unprocessed',
  },
  modified: {
    type: Boolean,
    default: false
  },
  browser: {
    type: String,
    required: true
  },
  buttonsFailedToClick: {
    type: Array,
    default: []
  },
  errorTriggeringFlows: {
    type: Array,
    default: []
  },
  processingTime: {
    type: Number
  },
  ignoredRecordings: {
    type: Array,
    default: []
  },
  progressData: {
    type: Object
  },
}, {
  versionKey: false,
  timestamps: true
});

schema.index({ urlHost:1, urlPath:1, browser:1 }, { unique: true });

schema.post('save', handleDuplicateKeyError);
schema.post('update', handleDuplicateKeyError);
schema.post('findOneAndUpdate', handleDuplicateKeyError);
schema.post('insertMany', handleDuplicateKeyError);

const FunctionalTesting = mongoose.model('FunctionalTesting', schema);

export default FunctionalTesting;
