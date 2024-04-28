import mongoose from 'mongoose';

import { handleDuplicateKeyError } from './error.js';

const schema = new mongoose.Schema({
  urlHost: {
    type: String
  },
  urlPath: {
    type: String
  },
  shopifyUrl: {
    type: String,
    required: true
  },
  testFrequency: {
    type: String,
    default: '3_days'
  },
  emails: {
    type: [String],
    default: []
  },
  sendEveryTest: {
    type: Boolean,
    default: false
  },
  subscriptions: {
    type: Array,
    default: []
  },
  uninstalled: {
    type: Boolean,
  },
  seenIntro: {
    type: Boolean,
    default: false
  },
  cartVerified: {
    type: Boolean
  },
  checkoutVerified: {
    type: Boolean
  },
  discountVerified: {
    type: Boolean
  },
  verifyingStore: {
    type: Boolean,
    default: true
  },
  otherShopifyInfo: {
    type: Object
  },
  session: {
    type: Object
  }
}, {
  versionKey: false,
  timestamps: true
});

schema.index({ shopifyUrl:1 }, { unique: true });

schema.post('save', handleDuplicateKeyError);
schema.post('update', handleDuplicateKeyError);
schema.post('findOneAndUpdate', handleDuplicateKeyError);
schema.post('insertMany', handleDuplicateKeyError);

const ShopifyTestUser = mongoose.model('ShopifyTestUsers', schema);

export default ShopifyTestUser;
