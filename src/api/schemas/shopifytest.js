export default {
  type: 'object',
  properties: {
    collectionsProcessed: { type: 'array' },
    productsProcessed: { type: 'array' },
    productsAddedToCart: { type: 'array' },
    passed: { type: 'object' },
    recordingUrl: { type: 'string' },
    shopifyUrl: { type: 'string' },
    user: { type: 'id' },
    processingTime: { type: 'number' },
    screenWidth: { type: 'number' }
  },
  required: [
      'shopifyUrl'
  ],
  additionalProperties: false,
};
