const { getIO } = require("../config/socket");

function emitOccasionCreated(occasion) {
    const io = getIO();
    io.emit('occasion:created', { occasion, timestamp: new Date() });
}

function emitOccasionUpdated(occasion) {
    const io = getIO();
    io.emit('occasion:updated', { occasion, timestamp: new Date() });
}

function emitOccasionDeleted(occasionId) {
    const io = getIO();
    io.emit('occasion:deleted', { occasionId, timestamp: new Date() });
}

function emitAttendanceUpdated(attendance) {
    const io = getIO();
    io.emit('occasion:attendance-updated', { attendance, timestamp: new Date() });
}

function emitEventsGrouped(groupedParties) {
    const io = getIO();
    io.emit('occasion:events-grouped', { groupedParties, timestamp: new Date() });
}

function emitOccasionsFetched(occasions) {
    const io = getIO();
    io.emit('occasion:fetched-all', { occasions, timestamp: new Date() });
}

module.exports = {
    emitOccasionCreated,
    emitOccasionUpdated,
    emitOccasionDeleted,
    emitAttendanceUpdated,
    emitEventsGrouped,
    emitOccasionsFetched
};
