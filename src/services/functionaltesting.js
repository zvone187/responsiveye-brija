import FunctionalTesting from '../models/functionaltesting.js';
import DatabaseError from '../models/error.js';

class FunctionalTestingService {
  static async list(query = {}) {
    try {
      return FunctionalTesting.find(query);
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async get(id) {
    try {
      return await FunctionalTesting.findOne({ _id: id }).exec();
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async getByUrl(host, path, browser) {
    try {
      return await FunctionalTesting.findOne({ urlHost: host, urlPath: path, browser }).exec();
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async create(data) {
    try {
      const obj = new FunctionalTesting(data);
      await obj.save();
      return obj;
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async update(id, data) {
    try {
      return await FunctionalTesting.findOneAndUpdate({ _id: id }, data, { new: true, upsert: false });
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async delete(id) {
    try {
      const result = await FunctionalTesting.deleteOne({ _id: id }).exec();
      return (result.deletedCount === 1);
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async updateByUrl(host, path, browser, data, updateType = 'set') {
    try {
      let update = {};
      update[`$${updateType}`] = data;
      await FunctionalTesting.findOneAndUpdate({ urlHost: host, urlPath: path, browser }, update, { upsert: true, setDefaultsOnInsert:true });
    } catch (err) {
      throw new DatabaseError(err);
    }
  }
}

export default FunctionalTestingService;
