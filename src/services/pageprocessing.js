import PageProcessing from '../models/pageprocessing.js';
import DatabaseError from '../models/error.js';

class PageProcessingService {
  static async list(query = {}) {
    try {
      return PageProcessing.find(query);
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async get(id) {
    try {
      return await PageProcessing.findOne({ _id: id }).exec();
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async getByUrl(host, path, browser) {
    try {
      return await PageProcessing.findOne({ urlHost: host, urlPath: path, browser }).exec();
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async create(data) {
    try {
      const obj = new PageProcessing(data);
      await obj.save();
      return obj;
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async update(id, data) {
    try {
      return await PageProcessing.findOneAndUpdate({ _id: id }, data, { new: true, upsert: false });
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async delete(id) {
    try {
      const result = await PageProcessing.deleteOne({ _id: id }).exec();
      return (result.deletedCount === 1);
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async updateByUrl(host, path, browser, data, updateType = 'set') {
    try {
      let update = {};
      update[`$${updateType}`] = data;
      await PageProcessing.findOneAndUpdate({ urlHost: host, urlPath: path, browser }, update, { upsert: true, setDefaultsOnInsert:true });
    } catch (err) {
      throw new DatabaseError(err);
    }
  }
}

export default PageProcessingService;
