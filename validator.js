class Validator {
  constructor() {
    this._errors = [];
    this._known_types = ['number', 'boolean', 'string', 'array', 'object'];
    this._failed = false;
    this._handlers = new Map();
    this._string_patterns = {
      'email': str => str.includes('@'),
      'date': str => /\d{4}-\d{2}-\d{2}$/.test(str) // YYYY-DD-MM
    };

    // Generic handlers for possible values
    this.bindHandler('[object Object]', this.isValidObject);
    this.bindHandler('[object Array]', this.isValidArray);
    this.bindHandler('[object Number]', (schema, oNum) => this.isValidNumber(schema, Number(oNum)));
    this.bindHandler('[object Boolean]', (schema, oNum) => this.isValidBoolean(schema, Boolean(oNum)));
    this.bindHandler('[object String]', (schema, oNum) => this.isValidString(schema, String(oNum)));
  }

  get Errors() {
    return this._errors;
  }

  bindHandler(type, handler) {
    this._handlers.set(type, handler.bind(this));
  }

  pushError(err) {
    this._errors.push(err);
  }

  fail(withErr) {
    if (withErr) {
      this.pushError(withErr);
    }
    this._failed = true;
  }
  
  // Equality check by value
  compareValues(a, b) {
    if (this.isObject(a) && this.isObject(b)) {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);

      if (aKeys.length !== bKeys.length) {
        return false;
      }

      for (const key of aKeys) {
        const aVal = a[key];
        const bVal = b[key];
        const bothObjects = this.isObject(aVal) && this.isObject(bVal);
        if (bothObjects && !this.compareValues(aVal, bVal) || (!bothObjects && aVal !== bVal)) {
          return false;
        }
      }
      return true;
    } else {
      return a === b;
    }
  }

  testProperty(prop, predicate, err) {
    if (prop !== undefined && !predicate(prop)) {
      this.fail(err);
    }
  }

  isObject(obj) {
    return obj != null && typeof obj === 'object';
  }

  isValidType(given, expected) {
    if (given !== expected) {
      this.fail('Type is incorrect');
    }
  }

  isValidNumber(schema, number) {
    this.isValidType(schema.type, 'number');
    this.testProperty(schema.minimum, p => p <= number, 'Value is less than it can be');
    this.testProperty(schema.maximum, p => p >= number, 'Value is greater than it can be');
    this.testProperty(schema.enum, p => p.includes(number), 'The enum does not support value');
  }

  isValidString(schema, str) {
    this.isValidType(schema.type, 'string');
    this.testProperty(schema.minLength, p => p <= str.length, 'Too short string');
    this.testProperty(schema.maxLength, p => p >= str.length, 'Too long string');
    this.testProperty(schema.pattern, p => p.test(str), 'String does not match pattern');
    this.testProperty(schema.enum, p => p.includes(str), 'The enum does not support value');
    this.testProperty(schema.format, p => this._string_patterns[p](str), 'Format of string is not valid');
  }

  isValidBoolean(schema, bool) {
    this.isValidType(schema.type, 'boolean')
  }

  isUniqueArray(arr) {
    for (let i = 0; i < arr.length; i++) {
      const first = arr[i];
      for (let j = 0; j < arr.length; j++) {
        const second = arr[j];
        if (i !== j && this.compareValues(first, second)) {
          return false;
        }
      }
    }
    return true;
  }

  isValidArray(schema, arr) {
    this.isValidType(schema.type, 'array');
    this.testProperty(schema.minItems, p => p <= arr.length, 'Items count less than can be');
    this.testProperty(schema.maxItems, p => p >= arr.length, 'Items count more than can be');
    this.testProperty(schema.contains, p => arr.some(item => this.compareValues(item, p)), 'Must contain a value, but does not');
    this.testProperty(schema.enum, p => p.some(value => this.compareValues(value, arr)), 'The enum does not support one of array elements');
    this.testProperty(schema.uniqueItems, p => this.isUniqueArray(arr), 'Elements of array not unique');
    this.testProperty(schema.items, p => {
      if (p.type) {
        // When single typed array, 'p' is a scheme itself;
        return arr.every(item => this.isValid(p, item));
      } else {
        // Look through given schemes and verify that at least one is OK
        return arr.every(item => Object.keys(p).some(scheme => new Validator().isValid(p[scheme], item)));
      }
    });
  }

  isValidObject(schema, obj) {
    this.isValidType(schema.type, 'object');
    this.testProperty(schema.minProperties, p => p <= Object.keys(obj).length, 'Too few properties in object');
    this.testProperty(schema.maxProperties, p => p >= Object.keys(obj).length, 'Too many properties in object');
    this.testProperty(schema.required, p => p.every(item => obj[item]), 'Property required, but value is undefined');
    this.testProperty(schema.properties, properties => {
      // Array of accepted properties
      const schemes = Object.keys(properties);
      // If every object's property corresponds to it's scheme property
      if (schemes.every(propName => this.isValid(properties[propName], obj[propName]))) {
        // Also if additional properties is true or the object has no other properties
        if (schema.additionalProperties || schemes.length === Object.keys(obj).length) {
          // Test OK
          return true;
        } else {
          this.fail('An object cant have additional properties');
        }
      }
      return false;
    }, 'Type is incorrect');
  }

  filterSchemas(schemas, data) {
    return schemas.filter(s => new Validator().isValid(s, data));
  }

  /**
   *
   * @param schema
   * @param dataToValidate
   * @returns {boolean}
   */
  isValid(schema = {}, dataToValidate) {
    const schemaVariants = schema.anyOf || schema.oneOf;

    // If there's an array of possible schemes
    if (schemaVariants) {
      const filtered = this.filterSchemas(schemaVariants, dataToValidate);

      if (filtered.length === 0) {
        this.fail('None schemas are valid');
      } else if (schema.oneOf) {
        if (filtered.length !== 1) {
          this.fail('More than one shema valid for this data');
        }
      }
    } else if (dataToValidate !== null) {
      // Using [object Type] to get the exact type of 'dataToValidate'
      // Mapping its type to a handler
      const type = Object.prototype.toString.call(dataToValidate);
      const handler = this._handlers.get(type);

      if (handler && this._known_types.includes(schema.type)) {
        // Call specific data handler
        handler(schema, dataToValidate);
      } else {
        this.fail('Unknown type');
      }
    } else if (!schema.nullable) {
      this.fail('Value is null, but nullable false');
    }

    return !this._failed;
  }
}