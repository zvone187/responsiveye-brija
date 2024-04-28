export default {
  type: 'object',
  properties: {
    urlHost: { type: 'string' },
    urlPath: { type: 'string' },
    shopifyUrl: { type: 'string' },
    testFrequency: { type: 'string' },
    emails: { type: 'array' },
    sendEveryTest: { type: 'boolean' },
    subscriptions: { type: 'array' },
    session: { type: 'object' },
    seenIntro: { type: 'boolean' },
    cartVerified: { type: 'boolean' },
    checkoutVerified: { type: 'boolean' },
    discountVerified: { type: 'boolean' },
    verifyingStore: { type: 'boolean' },
    otherShopifyInfo: { type: Object }
  },
  required: [
    'shopifyUrl'
  ],
  additionalProperties: false,
};
