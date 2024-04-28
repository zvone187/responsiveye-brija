/* Send mail using nodemailer
 *
 * Configure using NODEMAILER_* env variables.
 * See https://nodemailer.com/smtp/ for all options
 *
 * Send mail with:
 *
 *   import transport from "./src/utils/mail.js";
 *   await transport.sendMail({ from, to, subject, text });
 *
 * For all message options, see: https://nodemailer.com/message/
 */
import nodemailer from "nodemailer";

import config from "./config.js";

const options = {
  responsiveye: {
    host: config.NODEMAILER_HOST,
    port: config.NODEMAILER_PORT,
    secure: config.NODEMAILER_SECURE,
    auth: {
      user: config.NODEMAILER_USER,
      pass: config.NODEMAILER_PASS,
    }
  },
  shopify: {
    host: config.NODEMAILER_SHOPIFY_HOST,
    port: config.NODEMAILER_SHOPIFY_PORT,
    secure: config.NODEMAILER_SHOPIFY_SECURE,
    auth: {
      user: config.NODEMAILER_SHOPIFY_USER,
      pass: config.NODEMAILER_SHOPIFY_PASS,
    }
  }
};

const transporter = nodemailer.createTransport(options.responsiveye);
const sendMail = transporter.sendMail.bind(transporter);

const transporterShopify = nodemailer.createTransport(options.shopify);
const sendMailShopify = transporter.sendMail.bind(transporterShopify);

export {
  sendMail,
  sendMailShopify
};
