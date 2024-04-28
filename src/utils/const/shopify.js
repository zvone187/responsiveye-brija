export default {
  "firstName": "SafetyTest",
  "lastName": "SafetyTestSurname",
  "email": "hello@safetytest.io",
  "payment": {
    "number": ["1"],
    "name": "safety test",
    "expirationDate": ["01","23"],
    "csc": "123"
  },
  "developmentStorePass": "",
  "discountCodes": ["SAFETYTESTPRODUCTSCODE", "SAFETYTESTSHIPPINGCODE"],
  "priceRules": ["SafetyTestProductsPriceRule", "SafetyTestShippingPriceRule"],
  "API": {
    "version": "2022-10",
    "priceRuleCreateQuery": `
          mutation priceRuleCreate($priceRule: PriceRuleInput!, $priceRuleDiscountCode:PriceRuleDiscountCodeInput! ) {
            priceRuleCreate(priceRule: $priceRule, priceRuleDiscountCode: $priceRuleDiscountCode) {
              priceRule {
                id
              }
              priceRuleDiscountCode {
                id
              }
              priceRuleUserErrors {
                message
                code
                field
              }
            }
          }
        `
  },
  "shipping": {
    "United Kingdom": {
      "address": "Buckingham Palace",
      "address2": "Apt1",
      "city": "London",
      "postalCode": "SW1A 1AA",
      "phone": "07777666666"
    },
    "Croatia": {
      "address": "Ilica 1",
      "address2": "Apt1",
      "city": "Zagreb",
      "postalCode": "10110",
      "phone": "0981234567"
    },
    "United States": {
      "address": "1600 Pennsylvania Avenue NW",
      "address2": "Apt1",
      "city": "Washington DC",
      "state": "DC",
      "postalCode": "20500",
      "phone": "12112112222"
    },
    "India": {
      "address": "Mt Mary Rd, near Shanti Avedna Sadan, Mount Mary, Bandra West",
      "address2": "Apt1",
      "city": "Mumbai",
      "state": "Maharashtra",
      "postalCode": "400050",
      "phone": "8123456789"
    },
    "France": {
      "address": "Champ de Mars, 5 Av. Anatole France",
      "address2": "Apt1",
      "city": "Paris",
      "state": "Paris",
      "postalCode": "75007",
      "phone": "141234567"
    },
    "Pakistan": {
      "address": "R3V3+8MF, Old Korangi Rd, Sabir SRE Karachi Cantonment",
      "address2": "Apt1",
      "city": "Karachi",
      "state": "Sindh",
      "postalCode": "74000",
      "phone": "3001234567"
    }
  }
}
