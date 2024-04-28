import mongoose from 'mongoose';
import validator from 'validator';

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
  output: {
    type: String
  },
  preprocessedFiles: {
    type: Object
  },
  finalResults: {
    type: Object
  },
  downloadedCopies: {
    type: Array
  },
  breakpoints: {
    type: Array
  },
  ignoredElements: {
    type: Array,
    default: []
  },
  groupedErrors: {
    type: Object
  },
  modified: {
    type: Boolean,
    default: false
  },
  browser: {
    type: String,
    required: true
  }
}, {
  versionKey: false,
  timestamps: true
});

schema.index({ urlHost:1, urlPath:1, browser:1 }, { unique: true });

schema.post('save', handleDuplicateKeyError);
schema.post('update', handleDuplicateKeyError);
schema.post('findOneAndUpdate', handleDuplicateKeyError);
schema.post('insertMany', handleDuplicateKeyError);

const PageProcessing = mongoose.model('PageProcessing', schema);

export default PageProcessing;
