export default {
  type: 'object',
  properties: {
    urlHost: { type: 'string' },
    urlPath: { type: 'string' },
    status: { type: 'string' },
    modified: { type: 'boolean' },
    browser: { type: 'string' },
    buttonsFailedToClick: { type: 'array' },
    errorTriggeringFlows: { type: 'array' },
    processingTime: { type: 'number' },
    ignoredRecordings: { type: 'array' },
    progressData: { type: 'object' },
  },
  required: [
    'urlHost',
    'browser'
  ],
  additionalProperties: false,
};
