import supertest from 'supertest';
import { jest } from '@jest/globals'; // eslint-disable-line

import app from '../../../src/app.js';
import PageProcessingService from '../../../src/services/pageprocessing.js';
import UserService from '../../../src/services/user.js';

jest.mock('../../../src/services/pageprocessing.js');
jest.mock('../../../src/services/user.js');

UserService.authenticateWithToken = jest.fn().mockResolvedValue({ email: 'test@example.com' });

describe('/api/v1/page-processing/', () => {
  test('anonymous requests are blocked', async () => {
    const req = supertest(app);
    const res = await req.get('/api/v1/page-processing');
    expect(res.status).toBe(401);
  });

  test('GET lists all the models', async () => {
    const data = [{ name: 'First' }, { name: 'Second' }];
    PageProcessingService.list = jest.fn().mockResolvedValue(data);
    const req = supertest(app);

    const res = await req
      .get('/api/v1/page-processing')
      .set('Authorization', 'token abc');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(data);
    expect(PageProcessingService.list).toHaveBeenCalled();
  });

  test('POST creates a new PageProcessing', async () => {
    const data = {
      url: 'https://example.com',
      status: 'test',
      output: 'test',
    };

    PageProcessingService.create = jest.fn().mockResolvedValue(data);
    const req = supertest(app);

    const res = await req
      .post('/api/v1/page-processing')
      .set('Authorization', 'token abc')
      .send(data);

    expect(res.body).toEqual(data);
    expect(res.status).toBe(201);
    expect(PageProcessingService.create).toHaveBeenCalledWith(data);
  });

  test('creating a new PageProcessing without required attributes fails', async () => {
    const data = {};

    PageProcessingService.create = jest.fn().mockResolvedValue(data);
    const req = supertest(app);

    const res = await req
      .post('/api/v1/page-processing')
      .set('Authorization', 'token abc')
      .send(data);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(PageProcessingService.create).not.toHaveBeenCalled();
  });
});

describe('/api/v1/page-processing/:id', () => {
  test('getting a single result succeeds for authorized user', async () => {
    const data = { email: 'test@example.com' };
    PageProcessingService.get = jest.fn().mockResolvedValue(data);
    const req = supertest(app);

    const res = await req
      .get(`/api/v1/page-processing/507f1f77bcf86cd799439011`)
      .set('Authorization', 'token abc');

    expect(res.body).toEqual(data);
    expect(res.status).toBe(200);
    expect(PageProcessingService.get).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });

  test('getting a single result fails for anonymous user', async () => {
    const req = supertest(app);
    const res = await req.get('/api/v1/page-processing/507f1f77bcf86cd799439011');
    expect(res.status).toBe(401);
  });

  test('request for nonexistent object returns 404', async () => {
    const id = '507f1f77bcf86cd799439011';
    PageProcessingService.get = jest.fn().mockResolvedValue(null);
    const req = supertest(app);

    const res = await req
      .get(`/api/v1/page-processing/${id}`)
      .set('Authorization', 'token abc');

    expect(res.status).toBe(404);
    expect(PageProcessingService.get).toHaveBeenCalled();
  });

  test('request with incorrectly-formatted ObjectId fails', async () => {
    PageProcessingService.get = jest.fn();
    const req = supertest(app);

    const res = await req
      .get(`/api/v1/page-processing/bogus`)
      .set('Authorization', 'token abc');

    expect(res.status).toBe(400);
    expect(PageProcessingService.get).not.toHaveBeenCalled();
  });

  test('PageProcessing update', async () => {
    const data = {
      url: 'https://example.com',
    };
    PageProcessingService.update = jest.fn().mockResolvedValue(data);
    const req = supertest(app);

    const res = await req
      .put(`/api/v1/page-processing/507f1f77bcf86cd799439011`)
      .send(data)
      .set('Authorization', 'token abc');

    expect(res.body).toEqual(data);
    expect(res.status).toBe(200);
    expect(PageProcessingService.update).toHaveBeenCalledWith('507f1f77bcf86cd799439011', data);
  });

  test('PageProcessing deletion', async () => {
    PageProcessingService.delete = jest.fn().mockResolvedValue(true);
    const req = supertest(app);

    const res = await req
      .delete(`/api/v1/page-processing/507f1f77bcf86cd799439011`)
      .set('Authorization', 'token abc');

    expect(res.status).toBe(204);
    expect(PageProcessingService.delete).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });
});
