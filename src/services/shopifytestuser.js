import ShopifyTestUser from '../models/shopifytestuser.js';
import ShopifyTestService from '../services/shopifytest.js';
import DatabaseError from '../models/error.js';

class ShopifyTestUserService {
  static async list(query = {}) {
    try {
      return ShopifyTestUser.find(query);
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async get(id) {
    try {
      return await ShopifyTestUser.findOne({ _id: id }).exec();
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async getByHost(shopifyUrl) {
    try {
      return await ShopifyTestUser.findOne({ shopifyUrl }).exec();
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async create(data) {
    try {
      const obj = new ShopifyTestUser(data);
      await obj.save();
      return obj;
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async update(id, data) {
    try {
      return await ShopifyTestUser.findOneAndUpdate({ _id: id }, data, { new: true, upsert: false });
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async updateByHost(shopifyUrl, data) {
    try {
      return await ShopifyTestUser.findOneAndUpdate({ shopifyUrl }, data, { new: true, upsert: false });
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async delete(id) {
    try {
      const result = await ShopifyTestUser.deleteOne({ _id: id }).exec();
      return (result.deletedCount === 1);
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async deleteByHost(shopifyUrl) {
    try {
      const result = await ShopifyTestUser.deleteOne({ shopifyUrl }).exec();
      const resultTests = await ShopifyTestService.deleteByHost(shopifyUrl).exec();
      return (result.deletedCount === 1);
    } catch (err) {
      throw new DatabaseError(err);
    }
  }
}

export default ShopifyTestUserService;
