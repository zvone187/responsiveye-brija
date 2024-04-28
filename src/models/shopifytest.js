import mongoose from 'mongoose';

import { handleDuplicateKeyError } from './error.js';

const schema = new mongoose.Schema({
  collectionsProcessed: {
    type: Array
  },
  productsProcessed: {
    type: Array
  },
  productsAddedToCart: {
    type: Array
  },
  passed: {
    addToCart: {
      type: Boolean
    },
    checkout: {
      type: Boolean
    }
  },
  recordingUrl: {
    type: String
  },
  user: {
    type: mongoose.ObjectId
  },
  shopifyUrl: {
    type: String,
    required: true
  },
  processingTime: {
    type: Number
  },
  screenWidth: {
    type: Number
  }
}, {
  versionKey: false,
  timestamps: true
});

schema.index({ shopifyUrl:1 });

schema.post('save', handleDuplicateKeyError);
schema.post('update', handleDuplicateKeyError);
schema.post('findOneAndUpdate', handleDuplicateKeyError);
schema.post('insertMany', handleDuplicateKeyError);

const ShopifyTest = mongoose.model('ShopifyTest', schema);

export default ShopifyTest;
