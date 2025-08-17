const router = require('express').Router();
const { authAdmin, authGroup } = require('../utils/auth');
const occassionClient = require('../models/occassion')
const attendanceClient = require('../models/attendance');
const { emitOccasionCreated, emitOccasionUpdated, emitOccasionDeleted, emitAttendanceUpdated } = require('../utils/socketEmit');
require('dotenv').config()

async function markAttendance(userId, occasionId, status) {
    const occasion = await occassionClient.findById(occasionId);
    if (!occasion || occasion.status !== 'started') {
        throw new Error('Event not active');
    }

    const now = new Date();
    // if (now > occasion.start_at) status = 'late';

    const attendance = await attendanceClient.findOneAndUpdate(
        { user: userId, occasion: occasionId },
        { checkedInAt: now, status, updatedAt: now },
        { upsert: true, new: true }
    );
    return attendance;
}

router.post(
    '/create',
    authAdmin,
    async (req, res) => {
        try {

            const {
                name,
                start_at: startAtIso,
                events,
                time: timeIso,
                created_by,
                location,
                hijri_date,
                description,
            } = req.body;

            // Parse and build start date with time
            const startDateOnly = new Date(startAtIso);
            if (isNaN(startDateOnly)) {
                return res.status(400).json({ error: 'Invalid start_at date' });
            }
            startDateOnly.setHours(0, 0, 0, 0);

            const timeDate = new Date(timeIso);
            if (isNaN(timeDate)) {
                return res.status(400).json({ error: 'Invalid time' });
            }

            // Combine date + time properly
            startDateOnly.setHours(timeDate.getHours(), timeDate.getMinutes(), 0, 0);

            // End time 6 hours later
            const ends_at = new Date(startDateOnly.getTime() + 6 * 60 * 60 * 1000);

            if (ends_at <= startDateOnly) {
                return res.status(400).json({ error: 'Ends time must be after start time' });
            }


            // Check for overlapping pending occasions efficiently
            const conflictingOccasion = await occassionClient.findOne({
                status: 'pending',
                start_at: { $lt: ends_at },
                ends_at: { $gt: startDateOnly },
            }).lean();

            if (conflictingOccasion) {
                return res.status(400).json({ error: 'Another pending occasion overlaps with this time.' });
            }

            // Build occasion document payload
            const occasionData = {
                name,
                description,
                created_by,
                hijri_date,
                location,
                start_at: startDateOnly,
                ends_at,
                events,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const newOccasion = new occassionClient(occasionData);
            await newOccasion.save();
            emitOccasionCreated(newOccasion);

            return res.status(201).json(newOccasion);
        } catch (error) {
            console.error('Error creating occasion:', error, 'Request body:', req.body);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }
);

router.patch('/update/:id', authGroup, async (req, res) => {
    try {
        const { id } = req.params;
        const forbiddenFields = ['created_by', 'start_at'];

        // Check for forbidden fields in request body
        for (const field of forbiddenFields) {
            if (field in req.body) {
                return res.status(400).json({
                    success: false,
                    message: `Updating the field '${field}' is not allowed.`,
                });
            }
        }

        const occasion = await occassionClient.findById(id);
        if (!occasion) {
            return res.status(404).json({
                success: false,
                message: 'Occasion not found',
            });
        }

        // Copy existing attendees (ensure it's an array)
        let attendees = Array.isArray(occasion.attendees) ? [...occasion.attendees] : [];

        // Process attendance updates
        if (Array.isArray(req.body.attendance)) {
            for (const attendee of req.body.attendance) {
                const attendanceRec = await markAttendance(attendee.userId, id, attendee.status);
                emitAttendanceUpdated(attendanceRec);
            }

            // Add attendees with "present" status, filter valid userIds, and avoid duplicates
            const presentUserIds = req.body.attendance
                .filter((val) => val.status === "present" && val.userId)
                .map((val) => val.userId.toString());

            const existingUserIds = attendees.map((a) => a.toString());

            // Add only new userIds not already in attendees
            for (const userId of presentUserIds) {
                if (!existingUserIds.includes(userId)) {
                    attendees.push(userId);
                }
            }

            // Update occasion's attendees list
            occasion.attendees = attendees;
        }

        // Update events and nested ratings
        if (Array.isArray(req.body.events)) {
            const incomingEvents = req.body.events;

            // Map incoming events by _id for quick lookup
            const incomingMap = Object.create(null);
            incomingEvents.forEach((ev) => {
                if (ev._id) incomingMap[ev._id.toString()] = ev;
            });

            // Merge existing events with incoming updates
            let updatedEvents = occasion.events.map((existingEv) => {
                const existingId = existingEv._id?.toString();
                if (existingId && incomingMap[existingId]) {
                    const updateEv = incomingMap[existingId];

                    // Merge ratings if present
                    if (Array.isArray(updateEv.rating)) {
                        const ratingMap = Object.create(null);
                        updateEv.rating.forEach((r) => {
                            if (r.ratingBy) ratingMap[r.ratingBy.toString()] = r;
                        });

                        let newRatings = existingEv.rating.map((r) => {
                            const key = r.ratingBy?.toString();
                            if (key && ratingMap[key]) {
                                return { ...r.toObject ? r.toObject() : r, ...ratingMap[key] };
                            }
                            return r.toObject ? r.toObject() : r;
                        });

                        // Add new ratings not present yet
                        updateEv.rating.forEach((r) => {
                            if (
                                r.ratingBy &&
                                !newRatings.some((nr) => nr.ratingBy?.toString() === r.ratingBy.toString())
                            ) {
                                newRatings.push(r);
                            }
                        });

                        updateEv.rating = newRatings;
                    }

                    return { ...existingEv.toObject(), ...updateEv };
                }
                return existingEv.toObject ? existingEv.toObject() : existingEv;
            });

            // Add new events without _id or not in existing events
            incomingEvents.forEach((ev) => {
                const evIdStr = ev._id ? ev._id.toString() : null;
                if (!evIdStr || !updatedEvents.some((e) => e._id?.toString() === evIdStr)) {
                    updatedEvents.push(ev);
                }
            });

            occasion.events = updatedEvents;
        }

        // Update other simple fields excluding forbidden and "events"
        Object.keys(req.body).forEach((key) => {
            if (forbiddenFields.includes(key) || key === 'events' || key === 'attendance') return;
            occasion[key] = req.body[key];
        });

        // Update updatedat timestamp (ensure lowercase consistency)
        occasion.updatedat = new Date();

        const updatedDoc = await occasion.save();
        emitOccasionUpdated(updatedDoc);

        res.status(200).json(updatedDoc);
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during update',
        });
    }
});

router.delete('/remove/:id', authAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await occassionClient.deleteOne({ _id: id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Occasion not found." });
        }
        emitOccasionDeleted(id);
        return res.status(200).json({ message: "Occasion deleted successfully." });
    } catch (error) {
        console.error("Error deleting occasion:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.get('/fetch/all', async (req, res) => {
    try {
        const occasions = await occassionClient.find();
        return res.status(200).json(occasions);
    } catch (error) {
        console.error("Error fetching occasions:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.get('/fetch/id/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const occasion = await occassionClient.findOne({
            _id: id
        });

        if (!occasion) {
            return res.status(404).json({ error: "Occasion not found." });
        }

        return res.status(200).json(occasion);
    } catch (error) {
        console.error("Error fetching occasion by ID and partak:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.get('/fetch/status', async (req, res) => {
    try {
        // Support ?status=pending or ?status=pending,started or ?status[]=pending&status[]=started
        let { status } = req.query;

        // Normalize to array
        if (!status) {
            return res.status(400).json({ error: "Missing status parameter." });
        }
        if (typeof status === "string") {
            status = status.split(',');
        }

        // Find occasions with any of the given statuses
        const occasions = await occassionClient.find({
            status: { $in: status }
        });

        return res.status(200).json(occasions);
    } catch (error) {
        console.error("Error fetching occasions:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.get('/fetch/date/:date', async (req, res) => {
    const { date } = req.params;
    try {
        const occasions = await occassionClient.find({ start_at: { $eq: new Date(date) } });
        return res.status(200).json(occasions);
    } catch (error) {
        console.error("Error fetching occasions by date:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.get('/fetch/month/:month', async (req, res) => {
    const { month } = req.params;
    try {
        const occasions = await occassionClient.find({ start_at: { $regex: new RegExp(`^${month}`) } });
        return res.status(200).json(occasions);
    } catch (error) {
        console.error("Error fetching occasions by month:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.get('/fetch/year/:year', async (req, res) => {
    const { year } = req.params;
    try {
        const occasions = await occassionClient.find({ start_at: { $regex: new RegExp(`^${year}`) } });
        return res.status(200).json(occasions);
    } catch (error) {
        console.error("Error fetching occasions by year:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.get('/fetch/group', async (req, res) => {
    try {
        const groupedParties = await Occasion.aggregate([
            { $unwind: '$events' },
            {
                $group: {
                    _id: '$events.party',
                    count: { $sum: 1 },
                    events: { $push: '$events' }
                }
            },
            { $sort: { count: -1 } }
        ]);
        res.status(200).json(groupedParties);
    } catch (error) {
        console.error('Aggregation error:', error);
        res.status(500).json({ message: 'Server error during aggregation' });
    }
});

module.exports = router;