export default {
  type: 'object',
  properties: {
    urlHost: { type: 'string' },
    urlPath: { type: 'string' },
    downloadedCopies: { type: 'array' },
    status: { type: 'string' },
    output: { type: 'string' },
    lastProcessed: { type: 'date' },
    preprocessedFiles: { type: 'object' },
    finalResults: { type: 'object' },
    modified: { type: 'boolean' },
    browser: { type: 'string' },
    ignoredElements: { type: 'array'},
    groupedErrors: { type: 'object'}
  },
  required: [
    'urlHost',
    'browser'
  ],
  additionalProperties: false,
};
