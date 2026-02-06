const mongoose = require('mongoose');

const HouseholdSchema = new mongoose.Schema(
  {
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true, index: true },
    citizenUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    address: { type: String, required: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true } // [lng, lat]
    },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingPlan', default: null },
    // ✅ Days when crew comes for regular disposal pickup
    // Example: ['MON','TUE','WED','THU','FRI','SAT','SUN']
    pickupScheduleDays: {
      type: [String],
      default: ['MON', 'WED', 'FRI'],
      validate: {
        validator: function (v) {
          const allowed = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
          return Array.isArray(v) && v.every(x => allowed.includes(x));
        },
        message: 'pickupScheduleDays must be an array of weekday tokens'
      }
    }
  },
  { timestamps: true }
);

HouseholdSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Household', HouseholdSchema);
