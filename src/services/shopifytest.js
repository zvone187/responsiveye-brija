import ShopifyTest from '../models/shopifytest.js';
import DatabaseError from '../models/error.js';

class ShopifyTestService {
  static async list(query = {}) {
    try {
      return ShopifyTest.find(query);
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async get(id) {
    try {
      return await ShopifyTest.findOne({ _id: id }).exec();
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async getByHost(host, limit = 10) {
    try {
      return await ShopifyTest.find({ shopifyUrl: host }).sort({ createdAt: -1 }).limit(limit).exec();
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async create(data) {
    try {
      const obj = new ShopifyTest(data);
      await obj.save();
      return obj;
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async update(id, data) {
    try {
      return await ShopifyTest.findOneAndUpdate({ _id: id }, data, { new: true, upsert: false });
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async updateByQuery(query, data) {
    try {
      return await ShopifyTest.findOneAndUpdate(query, data, { new: true, upsert: false });
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async delete(id) {
    try {
      const result = await ShopifyTest.deleteOne({ _id: id }).exec();
      return (result.deletedCount === 1);
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async deleteByUser(user) {
    try {
      const result = await ShopifyTest.deleteMany({ user }).exec();
      return result.deletedCount;
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async deleteByHost(host) {
    try {
      const result = await ShopifyTest.deleteMany({ shopifyUrl: host }).exec();
      return result.deletedCount;
    } catch (err) {
      throw new DatabaseError(err);
    }
  }
}

export default ShopifyTestService;
