class Validator {
  constructor() {
    this._errors = [];
    this._known_types = ['number', 'boolean', 'string', 'array', 'object'];
    this._failed = false;
    this._handlers = new Map();

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
        const areObjects = this.isObject(aVal) && this.isObject(bVal);
        if (areObjects && !deepEqual(aVal, bVal) || (!areObjects && aVal !== bVal)) {
          return false;
        }
      }
      return true;
    } else {
      return a === b;
    }
  }

  isObject(obj) {
    return obj != null && typeof obj === 'object';
  }

  isValidNumber(schema, number) {
    if (schema.type !== 'number') {
      this.fail('Type is incorrect');
    }
    if (schema.minimum && schema.minimum > number) {
      this.fail('Value is less than it can be');
    }
    if (schema.maximum && schema.maximum < number) {
      this.fail('Value is greater than it can be');
    }
    if (schema.enum && !schema.enum.includes(number)) {
      this.fail('The enum does not support value');
    }
  }

  isValidString(schema, str) {
    if (schema.type !== 'string') {
      this.fail('Type is incorrect');
    }
    if (schema.minLength && schema.minLength > str.length) {
      this.fail('Too short string');
    }
    if (schema.maxLength && schema.maxLength < str.length) {
      this.fail('Too long string');
    }
    if (schema.pattern && !schema.pattern.test(str)) {
      this.fail('String does not match pattern');
    }
    if (schema.enum && !schema.enum.includes(str)) {
      this.fail('The enum does not support value');
    }
    switch (schema.format) {
      case 'email':
        if (!str.includes('@')) {
          this.fail('Format of string is not valid');
        }
        break;
      case 'date':
        // YYYY-DD-MM format
        if (!/\d{4}-\d{2}-\d{2}$/.test(str)) {
          this.fail('Format of string is not valid');
        }
        break;
    }
  }

  isValidBoolean(schema, bool) {
    if (schema.type !== 'boolean') {
      this.fail('Type is incorrect');
    }
  }


  isValidArray(schema, arr) {
    if (schema.type !== 'array') {
      this.fail('Type is incorrect');
    }
    if (schema.minItems && schema.minItems > arr.length) {
      this.fail('Items count less than can be');
    }
    if (schema.maxItems && schema.maxItems < arr.length) {
      this.fail('Items count more than can be');
    }
    for (const element of arr) {
      if (schema.enum) {
        if (!schema.enum.some(supported => supported.some(item => this.compareValues(element, item)))) {
          this.fail('The enum does not support one of array elements');
        }
      }
      if (schema.items) {
        if (schema.items.type) {
          this.isValid(schema.items, element);
        } else {
          if (!schema.items.some(type => new Validator().isValid(type, element))) {
            this.fail();
          }
        }
      }
    }
    if (schema.contains && !arr.some(item => this.compareValues(item, schema.contains))) {
      this.fail('Must contain a value, but does not');
    }
    if (schema.uniqueItems) {
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        for (let j = 0; j < arr.length; j++) {
          const b = arr[j];
          if (i !== j && this.compareValues(a, b)) {
            this.fail('Elements of array not unique')
          }
        }
      }
    }
  }

  isValidObject(schema, obj) {
    if (schema.type !== 'object') {
      this.fail('Type is incorrect');
    }
    if (schema.minProperties && schema.minProperties > Object.keys(obj).length) {
      this.fail('Too few properties in object')
    }
    if (schema.maxProperties && schema.maxProperties < Object.keys(obj).length) {
      this.fail('Too many properties in object')
    }
    if (schema.properties) {
      for (const key in obj) {
        if (schema.properties[key]) {
          this.isValid(schema.properties[key], obj[key]);
        } else if (!schema.additionalProperties) {
          this.fail('An object cant have additional properties');
        }
      }
    }
    if (schema.required) {
      for (const element of schema.required) {
        if (!obj[element]) {
          this.fail('Property required, but value is undefined');
        }
      }
    }
  }

  /**
   *
   * @param schema
   * @param dataToValidate
   * @returns {boolean}
   */
  isValid(schema = {}, dataToValidate) {
    if (schema.oneOf) {
      const filtered = schema.oneOf.filter(s => new Validator().isValid(s, dataToValidate));
      if (filtered.length === 0) {
        this.fail('None schemas are valid');
      } else if (filtered.length !== 1) {
        this.fail('More than one shema valid for this data');
      }
    } else if (schema.anyOf) {
      if (!schema.anyOf.some(s => new Validator().isValid(s, dataToValidate))) {
        this.fail('None schemas are valid');
      }
    } else {
      if (dataToValidate !== null) {
        const type = Object.prototype.toString.call(dataToValidate);
        const cast = this._handlers.get(type);
        if (cast && this._known_types.includes(schema.type)) {
          cast(schema, dataToValidate);
        } else {
          this.fail('Unknown type');
        }
      } else if (!schema.nullable) {
        this.fail('Value is null, but nullable false');
      }
    }
    return !this._failed;
  }
}