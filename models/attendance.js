const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    occasion: { type: mongoose.Schema.Types.ObjectId, ref: 'occasions', required: true },
    checkedInAt: { type: Date, default: null },
    status: {
        type: String,
        enum: ['absent', 'present', 'late', 'excused'],
        default: 'absent'
    },
    notes: { type: String, default: '' }, 
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
}, {
    collection: 'attendance',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

attendanceSchema.index({ occasion: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
