require('../config/dataBase')
const mongoose = require('mongoose')
const { allowedTypes } = require('../utils/validateUtils')

const occasionSchema = new mongoose.Schema(
    {
        createdat: { type: Date, default: Date.now },
        updatedat: { type: Date, default: Date.now },
        time: { type: Date, default: Date.now },
        start_at: { type: Date, default: Date.now },
        ends_at: { type: Date, default: Date.now },
        location: { type: String, default: '' },
        name: { type: String, default: '' },
        description: { type: String, default: '' },
        created_by: { type: String, default: '' },
        status: { type: String, default: 'pending' },
        attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        hijri_date: {
            year: { type: Number, default: null },
            month: { type: Number, default: null },
            day: { type: Number, default: null }
        },
        events: [
            {
                type: { type: String },
                name: { type: String },
                party: { type: String },
                rating: [
                    {
                        score: { type: Number, enum: [1, 2, 3, 4, 5] },
                        ratingBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                        createdAt: { type: Date, default: Date.now }
                    }
                ]
            }
        ],
        parties: [
            {
                name: { type: String },
                count: { type: Number }
            }
        ]
    },
    { collection: "occasions" }
);


module.exports = mongoose.model('occasions', occasionSchema);  