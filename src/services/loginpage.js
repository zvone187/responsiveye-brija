import LoginPage from '../models/loginpage.js';
import DatabaseError from '../models/error.js';

class LoginPageService {
  static async list(query = {}) {
    try {
      return LoginPage.find(query);
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async get(id) {
    try {
      return await LoginPage.findOne({ _id: id }).exec();
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async getByUrl(host) {
    try {
      return await LoginPage.findOne({ urlHost: host }).exec();
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async create(data) {
    try {
      const obj = new LoginPage(data);
      await obj.save();
      return obj;
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async update(id, data) {
    try {
      return await LoginPage.findOneAndUpdate({ _id: id }, data, { new: true, upsert: false });
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async delete(id) {
    try {
      const result = await LoginPage.deleteOne({ _id: id }).exec();
      return (result.deletedCount === 1);
    } catch (err) {
      throw new DatabaseError(err);
    }
  }

  static async updateByUrl(host, data, updateType = 'set') {
    try {
      let update = {};
      update[`$${updateType}`] = data;
      await LoginPage.findOneAndUpdate({ urlHost: host }, update, { upsert: true, setDefaultsOnInsert:true });
    } catch (err) {
      throw new DatabaseError(err);
    }
  }
}

export default LoginPageService;
