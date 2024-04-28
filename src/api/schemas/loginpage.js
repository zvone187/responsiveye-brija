export default {
  type: 'object',
  properties: {
    urlHost: { type: 'string' },
    urlPath: { type: 'string' },
    email: { type: 'string' },
    password: { type: 'string' },
  },
  required: [
    'urlHost',
    'urlPath'
  ],
  additionalProperties: false,
};
