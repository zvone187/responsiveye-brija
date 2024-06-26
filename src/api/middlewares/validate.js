import { Validator } from 'jsonschema';
import validator from 'validator';
import User from "../../models/user.js";
import {isPasswordHash} from "../../utils/password.js";

const defaultOptions = {
  required: true,
};

const jsValidator = new Validator();
jsValidator.customFormats.mongoObjectId = (input) => {
  return typeof input === 'string' && validator.isMongoId(input);
};

export const requireSchema = (schema, options = {}) => {
  const validatorOptions = { ...defaultOptions, ...options };

  const validatorFunc = (req, res, next) => {
    const { body } = req;
    if (!body) {
      res.status(400).json({ error: 'missing request body' });
      return;
    }

    const v = jsValidator.validate(body, schema, validatorOptions);
    if (!v.valid) {
      res.status(400).json({
        error: 'request body validation failed',
        details: v.errors.map((err) => `${err.property}: ${err.message}`),
      });
      return;
    }

    req.validatedBody = v.instance;
    next();
  };

  return validatorFunc;
};

export const requireValidId = (req, res, next) => {
  if (!validator.isMongoId(req.params.id)) {
    res.status(400).json({ error: 'URL does not contain a valid object ID' });
    return;
  }
  next();
};

export const verifyAdmin = async (username, password) => {
  if (username !== 'admin') return new Error('Not logged in as admin');
  if (!isPasswordHash(password)) return new Error('Invalid password');
  let user = await User.findOne({ username });
  if (user.password !== password) return new Error('Wrong password');
  return true;
}
