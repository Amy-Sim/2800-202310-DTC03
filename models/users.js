const mongoose = require('mongoose');

const pantryItemSchema = new mongoose.Schema({
  food: String,
  bestBeforeDate: Date,
}, {_id: false});

const usersSchema = new mongoose.Schema({
  username: String,
  name: String,
  email: String,
  password: String,
  securityQuestion: String,
  securityAnswer: String,
  persona: String,
  pantry: [pantryItemSchema],
  cuisinePreference: Array,
  dietaryRestrictions: Array,
  persona: String,
  hasOutdatedItems: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    default: 'user'
  },
  emailNotifications: {
    type: String,
    default: 'checked'
  },
});


const usersModel = mongoose.model('users', usersSchema);

module.exports = usersModel;