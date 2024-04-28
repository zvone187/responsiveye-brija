export default {
  type: 'object',
  properties: {
    email: { type: 'string' },
    password: { type: 'string' },
    username: { type: 'string' },
    pages: { type: 'array' },
    token: { type: 'string' },
    name: { type: 'string' },
    createdAt: { type: 'date' },
    lastLoginAt: { type: 'date' },
    isActive: { type: 'boolean' },
    permissions: { type: 'string' },
  },
  required: [
      'email'
  ],
  additionalProperties: false,
};
