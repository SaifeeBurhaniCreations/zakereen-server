require('../config/dataBase')
const mongoose = require('mongoose')


const userSchema = new mongoose.Schema({

fullname: { type: String, default: '' },
createdat: { type: Date, default: Date.now() },
updatedat: { type: Date, default: Date.now() },
userid: { type: String, default: 0 },
userpass: { type: String, default: '' },
address: { type: String, default: '' },
phone: { type: String, default: 0 },
email: { type: String, default: '' },
role: { type: String, default: 'member' },
title: { type: String, default: '' },
belongsto: { type: String, default: '' },
grade: { type: String, default: '' },
attendence: [{ type: mongoose.Schema.Types.ObjectId, ref: 'occasions' }],
profileImage: {
    s3Url: { type: String, default: '' },
    s3Key: { type: String, default: '' },
},

});

module.exports = mongoose.model('User', userSchema);